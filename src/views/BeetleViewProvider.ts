import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as util from 'util';
import * as crypto from 'crypto';
import * as os from 'os';
import { AuthenticationProvider } from '../authentication/AuthenticationProvider';
import { BeetleService } from '../services/BeetleService';
import { Logger } from '../utils/logger';
import { WebviewMessage, ExtensionMessage, ReviewFile } from '../types';
import { VIEW_ID_MAIN } from '../utils/constants';
import { generateSessionName, resetSessionCounter } from '../utils/sessionNames';

const exec = util.promisify(cp.exec);

// File extensions to exclude from review analysis
const EXCLUDED_EXTENSIONS = [
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.tif',
  // Videos
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v',
  // Audio
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
  // Documents & Archives
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  // Markdown & Documentation (unnecessary for code analysis)
  '.md', '.mdx', '.markdown',
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // Other binary/data files
  '.sqlite', '.db', '.lock', '.bin', '.exe', '.dll', '.so', '.dylib',
  // Design files
  '.psd', '.ai', '.sketch', '.fig', '.xd'
];

export class BeetleViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private authProvider: AuthenticationProvider;
  private beetleService: BeetleService;
  private logger: Logger;
  private gitAPI?: GitAPI;

  private commentController: vscode.CommentController;
  private commentThreads: Map<string, vscode.CommentThread> = new Map(); // Track created threads
  private gutterDecorationType: vscode.TextEditorDecorationType; // Beetle icon in gutter
  private decoratedLines: Map<string, number[]> = new Map(); // Track which lines have icons per file
  
  // Review session management - store MULTIPLE sessions for progressive review
  private sessions: any[] = []; // All review sessions
  private currentSession: any | null = null; // Current active session
  private currentReviewId: string | null = null;
  private lastReviewState: {
    branch: string;
    commit: string;
    filesHash: string;
  } | null = null;
  
  // Track staged files count for notification
  private previousStagedCount: number = 0;
  private attachedRepoListeners: Set<string> = new Set();

  constructor(
    context: vscode.ExtensionContext,
    authProvider: AuthenticationProvider,
    beetleService: BeetleService,
    logger: Logger
  ) {
    this.context = context;
    this.authProvider = authProvider;
    this.beetleService = beetleService;
    this.logger = logger;
    
    // Initialize Comment Controller
    this.commentController = vscode.comments.createCommentController('beetle-review', 'Beetle AI Review');
    context.subscriptions.push(this.commentController);

    // Initialize Gutter Decoration (Beetle icon)
    this.gutterDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.file(path.join(context.extensionPath, 'media', 'beetle-icon.svg')),
      gutterIconSize: 'contain'
    });

    // Listen for auth state changes
    authProvider.onAuthStateChanged(async (isAuthenticated) => {
      this.logger.info('Auth state changed', { isAuthenticated });
      // Notify React app about auth state change
      this.sendMessage({
        type: 'authStateChanged',
        isAuthenticated
      });
      
      if (isAuthenticated) {
        await this.loadUserData();
      }
    });
    
    // Register content provider for diff view
    this.context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider('beetle-original', this as any)
    );
    
    // Initialize Git integration immediately (for staging detection even when panel is closed)
    this.initializeGit();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview'))
      ]
    };

    // Load React app
    webviewView.webview.html = this.getWebviewContent();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        await this.handleWebviewMessage(message);
      },
      undefined,
      this.context.subscriptions
    );

    // Restore cached review sessions and send auth state
    (async () => {
      const isAuthenticated = await this.authProvider.isAuthenticated();
      this.sendMessage({
        type: 'authStateChanged',
        isAuthenticated
      });
      
      // Restore cached review sessions
      this.restoreCachedSessions();
    })();
  }

  /**
   * Handle messages from webview
   */
  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    this.logger.info('Received webview message', { type: message.type });

    switch (message.type) {
      case 'ready':
        // Webview is ready, send auth state and user data
        const isAuth = await this.authProvider.isAuthenticated();
        this.sendMessage({
          type: 'authStateChanged',
          isAuthenticated: isAuth
        });
        
        if (isAuth) {
          await this.loadUserData();
        }

        // Restore cached review sessions
        this.restoreCachedSessions();

        // Send current Git data if available
        if (this.gitAPI) {
          this.sendMessage({ type: 'log', message: `Ready received. Git API available. Repos: ${this.gitAPI.repositories.length}` });
          if (this.gitAPI.repositories.length > 0) {
            this.logger.info('Sending initial Git data on ready');
            await this.updateRepoInfo(this.gitAPI.repositories[0]);
          } else {
            this.sendMessage({ type: 'log', message: 'No repositories to send on ready' });
          }
        } else {
          this.sendMessage({ type: 'log', message: 'Ready received but Git API not initialized yet' });
        }
        break;

      case 'login':
        await this.authProvider.login();
        break;

      case 'logout':
        await this.authProvider.logout();
        break;

      case 'selectRepository':
        await this.handleSelectRepository();
        break;

      case 'selectBranch':
        await this.handleSelectBranch();
        break;

      case 'openFile':
        if ('file' in message) {
          await this.handleOpenFile(message.file);
        }
        break;

      case 'triggerReview':
        const filePaths = 'filePaths' in message ? message.filePaths : undefined;
        await this.handleTriggerReview(filePaths);
        break;

      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'beetle');
        break;

      case 'openUpgrade':
        vscode.env.openExternal(vscode.Uri.parse('https://beetleai.dev/pricing'));
        break;
        
      case 'navigateToComment':
        if ('filePath' in message && 'line' in message) {
          await this.handleNavigateToComment(message.filePath, message.line);
        }
        break;
        
      case 'toggleFile':
        if ('filePath' in message) {
          const sessionId = 'sessionId' in message ? message.sessionId : undefined;
          this.handleToggleFile(message.filePath, sessionId);
        }
        break;
  
      case 'markCommentResolved':
        this.handleMarkResolvedFromWebview(message.commentId, message.filePath, message.lineStart);
        break;
      case 'copyToClipboard':
        vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage('✨ AI prompt copied to clipboard!');
        break;
      case 'showWarning':
        vscode.window.showWarningMessage(message.message);
        break;
      case 'clearSession':
        this.handleClearSession();
        break;

      case 'deleteSession':
        const sessionId = 'sessionId' in message ? message.sessionId : '';
        this.handleDeleteSession(sessionId);
        break;

      case 'stopReview':
        const stopSessionId = 'sessionId' in message ? message.sessionId : '';
        this.handleStopReview(stopSessionId);
        break;

      default:
        this.logger.warn('Unknown message type', message);
    }
  }

  /**
   * Load and send user data to webview
   */
  private async loadUserData(): Promise<void> {
    try {
      const user = await this.beetleService.getUserInfo();
      
      // If user is null or undefined, logout
      if (!user) {
        this.logger.warn('User data is null or undefined, triggering logout');
        await this.authProvider.logout();
        
        this.sendMessage({
          type: 'error',
          message: 'Failed to load user data. Please login again.'
        });
        return;
      }
      
      this.sendMessage({
        type: 'userData',
        user
      });
    } catch (error) {
      this.logger.error('Failed to load user data', error);
      
      // Clear JWT and show login page if user fetch fails
      this.logger.info('Clearing authentication due to failed user fetch');
      await this.authProvider.logout();
      
      this.sendMessage({
        type: 'error',
        message: 'Failed to load user data. Please login again.'
      });
    }
  }

  /**
   * Handle clear session
   */
  private handleClearSession(): void {
    this.logger.info('Clearing review session');
    
    try {
      // Stop any active polling
      if (this.currentReviewId) {
        this.beetleService.stopCommentPolling(this.currentReviewId);
      }
      
      // Clear session data
      this.sessions = []; // Clear ALL sessions
      this.currentSession = null;
      this.currentReviewId = null;
      
      // Clear comment threads and decorations
      this.commentThreads.forEach(thread => thread.dispose());
      this.commentThreads.clear();
      this.decoratedLines.clear();
      
      // Reset session counter
      resetSessionCounter();
      
      // Persist the cleared session (removes from workspaceState)
      this.saveCachedSessions();
      
      // Notify UI that session is cleared
      this.sendMessage({
        type: 'reviewSessionsUpdated',
        sessions: [],
        currentSessionId: null
      });
      
      vscode.window.showInformationMessage('✓ Review session cleared');
      this.logger.info('Review session cleared successfully');
      
    } catch (error) {
      this.logger.error('Error clearing session', error);
      vscode.window.showErrorMessage('Failed to clear session');
    }
  }

  /**
   * Handle delete specific session
   */
  private handleDeleteSession(sessionId: string): void {
    this.logger.info(`Deleting session: ${sessionId}`);
    
    try {
      // Find and remove session
      const sessionIndex = this.sessions.findIndex(s => s.dataId === sessionId);
      if (sessionIndex === -1) {
        this.logger.warn(`Session not found: ${sessionId}`);
        return;
      }
      
      // Remove session
      this.sessions.splice(sessionIndex, 1);
      
      // If we deleted the current session, set current to the next one
      if (this.currentSession?.dataId === sessionId) {
        this.currentSession = this.sessions[0] || null;
        this.currentReviewId = this.currentSession?.dataId || null;
      }
      
      // Persist changes
      this.saveCachedSessions();
      
      // Notify UI
      this.sendMessage({
        type: 'reviewSessionsUpdated',
        sessions: this.sessions,
        currentSessionId: this.currentSession?.dataId || null
      });
      
      this.logger.info(`✅ Deleted session: ${sessionId}`);
      
    } catch (error) {
      this.logger.error('Error deleting session', error);
      vscode.window.showErrorMessage('Failed to delete session');
    }
  }
  
  /**
   * Handle stop review - interrupt ongoing analysis
   */
  private async handleStopReview(sessionId: string): Promise<void> {
    this.logger.info(`Stopping review: ${sessionId}`);
    
    try {
      // Find the session
      const session = this.sessions.find(s => s.dataId === sessionId);
      if (!session) {
        this.logger.warn(`Session not found: ${sessionId}`);
        return;
      }

      // Only allow stopping if currently running
      if (session.status !== 'running') {
        vscode.window.showInformationMessage('Analysis is not running');
        return;
      }

      // Call API to stop the analysis
      const result = await this.beetleService.stopReview(sessionId);
      
      if (!result) {
        vscode.window.showErrorMessage('Failed to stop analysis');
        return;
      }

      this.logger.info(`✅ Analysis stopped: ${sessionId}`, result);

      // Update session status
      session.status = 'interrupted';

      // Stop polling
      this.beetleService.stopCommentPolling(sessionId);

      // If this is the current session, clear it
      if (this.currentSession?.dataId === sessionId) {
        this.currentSession = null;
        this.currentReviewId = null;
      }

      // Persist changes
      this.saveCachedSessions();

      // Notify UI
      this.sendMessage({
        type: 'reviewSessionsUpdated',
        sessions: this.sessions,
        currentSessionId: this.currentSession?.dataId || null
      });

      vscode.window.showInformationMessage('✓ Review stopped');
      
    } catch (error) {
      this.logger.error('Error stopping review', error);
      vscode.window.showErrorMessage('Failed to stop review');
    }
  }
  
  private getReviewTitle(): string {
    const repo = this.gitAPI?.repositories[0];
    const branchName = repo?.state.HEAD?.name || 'main';
    // Pass existing sessions to determine next sequential number
    return generateSessionName(branchName, this.sessions);
  }    

  /**
   * Handle repository selection
   */
  private async handleSelectRepository(): Promise<void> {
    try {
      const repos = await this.beetleService.getRepositories();
      
      if (repos.length === 0) {
        vscode.window.showInformationMessage('No repositories found');
        return;
      }

      const items = repos.map(repo => ({
        label: repo.name,
        description: repo.fullName,
        repo
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a repository'
      });

      if (selected) {
        this.logger.info('Repository selected', selected.repo.name);
        // TODO: Store selected repo and fetch branches
      }
    } catch (error) {
      this.logger.error('Failed to select repository', error);
      vscode.window.showErrorMessage('Failed to load repositories');
    }
  }

  /**
   * Handle branch selection
   */
  private async handleSelectBranch(): Promise<void> {
    vscode.window.showInformationMessage('Branch selection coming soon!');
  }


  /**
   * Handle mark resolved from webview (sidebar)
   */
  private handleMarkResolvedFromWebview(commentId: string, filePath: string, lineStart: number): void {
    this.logger.info('Mark resolved from webview', { commentId, filePath, lineStart });
    
    try {
      // Find and update the comment in the session
      if (this.currentSession) {
        let commentFound = false;
        
        for (const fileGroup of this.currentSession.files) {
          const commentIndex = fileGroup.comments.findIndex(
            (c: any) => c.file_path === filePath && c.line_start === lineStart
          );
          
          if (commentIndex !== -1) {
            // Mark comment as resolved
            fileGroup.comments[commentIndex].resolved = true;
            this.currentSession.resolvedComments++;
            commentFound = true;
            
            // Send update to webview
            this.sendReviewSessionUpdate(this.currentSession);
            
            this.logger.info('Comment marked as resolved in session', {
              filePath,
              lineStart,
              resolvedCount: this.currentSession.resolvedComments,
              totalCount: this.currentSession.totalComments
            });
            
            vscode.window.showInformationMessage('✓ Comment marked as resolved');
            break;
          }
        }
        
        if (!commentFound) {
          this.logger.warn('Comment not found in session', { filePath, lineStart });
        }
      }
    } catch (error) {
      this.logger.error('Error marking comment as resolved from webview', error);
      vscode.window.showErrorMessage('Failed to mark as resolved');
    }
  }

  /**
   * Handle trigger review
   */
  private async handleTriggerReview(filePaths?: string[]): Promise<void> {
    try {
      if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
        vscode.window.showErrorMessage('No repository found');
        return;
      }
      
      const repo = this.gitAPI.repositories[0];
      const repoName = path.basename(repo.rootUri.fsPath);
      const branchName = repo.state.HEAD?.name || 'unknown';
      const commitSha = repo.state.HEAD?.commit || '';

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Preparing review...",
        cancellable: false
      }, async (progress) => {
        try {
          // Get diffs
          const cwd = repo.rootUri.fsPath;
          const { stdout: diffStaged } = await exec('git diff --cached', { cwd });
          const { stdout: diffUnstaged } = await exec('git diff', { cwd });
          const fullDiff = (diffStaged || '') + (diffUnstaged || '');

          if (!fullDiff) {
            vscode.window.showInformationMessage('No changes to review');
            return;
          }

          // Get changed files details
          const filesData = await Promise.all([
            ...repo.state.workingTreeChanges,
            ...repo.state.indexChanges
          ].map(async (change) => {
            const filePath = vscode.workspace.asRelativePath(change.uri);
            const status = this.mapGitStatus(change.status);
            
            // Get current content for incremental tracking
            let currentContent = '';
            try {
              currentContent = await fs.promises.readFile(path.join(cwd, filePath), 'utf8');
            } catch (e) {
              this.logger.warn(`Failed to read content for ${filePath}`, e);
            }

            // Check for previous review content - use MOST RECENT session
            let lastReviewedContent: string | null = null;
            let lastReviewedHash: string | null = null;
            
            // Find the most recent session that reviewed this file
            for (const session of this.sessions) {
              const file = session.files.find((f: any) => f.filePath === filePath);
              if (file && file.lastReviewedContent) {
                lastReviewedContent = file.lastReviewedContent;
                lastReviewedHash = file.lastReviewedHash || null;
                // Use the first (most recent) session found
                break;
              }
            }
            
            // Calculate current file content hash
            const currentContentHash = this.calculateFileHash(currentContent);
            
            // If hash matches, skip this file (no changes)
            if (lastReviewedHash && currentContentHash === lastReviewedHash) {
              this.logger.info(`⏭️ Skipping ${filePath} - no changes since last review (hash match)`);
              return null; // Signal to filter this out
            }
            
            // Get diff for this file
            let patch = '';
            try {
              if (lastReviewedContent && currentContent) {
                // Incremental review: diff between last reviewed content and current
                this.logger.info(`🔄 Calculating incremental diff for ${filePath} (since last review)`);
                patch = await this.getIncrementalDiff(lastReviewedContent, currentContent, filePath);
                
                if (!patch || patch.trim() === '') {
                  this.logger.info(`⏭️ No incremental changes for ${filePath} - skipping`);
                  return null; // Filter out files with no changes
                }
              } else {
                // First-time review: use standard diff logic
                const isUntracked = change.status === 7; // UNTRACKED
                
                if (isUntracked) {
                  patch = currentContent; // Use full content for untracked
                } else {
                  const { stdout } = await exec(`git diff HEAD -- "${filePath}"`, { cwd });
                  patch = stdout;
                }
              }
            } catch (e) {
              this.logger.warn(`Failed to get diff for ${filePath}`, e);
              return null; // Skip on error
            }

            // Estimate additions/deletions from patch
            const additions = (patch.match(/^\+/gm) || []).length - 1; // -1 for the file header +++
            const deletions = (patch.match(/^-/gm) || []).length - 1; // -1 for the file header ---

            return {
              filename: filePath,
              status,
              additions: Math.max(0, additions),
              deletions: Math.max(0, deletions),
              patch,
              lastReviewedContent: currentContent // Store for next time
            };
          }));

          // Remove nulls (files with no changes), duplicates, and excluded file types
          let uniqueFilesData = filesData
            .filter((f): f is NonNullable<typeof f> => f !== null)
            .filter((f, index, self) => 
              index === self.findIndex((ff) => ff.filename === f.filename)
            )
            .filter(f => !this.shouldExcludeFile(f.filename));
          
          // INCREMENTAL: Filter to only specified files if provided
          if (filePaths && filePaths.length > 0) {
            this.logger.info(`🔄 Incremental review: filtering to ${filePaths.length} files`, { filePaths });
            uniqueFilesData = uniqueFilesData.filter(f => filePaths.includes(f.filename));
          } else {
            this.logger.info(`🌟 Full review: ${uniqueFilesData.length} files`);
          }
          
          if (uniqueFilesData.length === 0) {
            vscode.window.showInformationMessage('No new changes to review');
            return;
          }

          // Get remote URL
          let remoteUrl = repo.rootUri.fsPath;
          try {
            const { stdout } = await exec('git config --get remote.origin.url', { cwd });
            if (stdout && stdout.trim()) {
              remoteUrl = stdout.trim();
              // Convert SSH to HTTPS if needed
              if (remoteUrl.startsWith('git@')) {
                 remoteUrl = remoteUrl.replace(':', '/').replace('git@', 'https://');
              }
              if (remoteUrl.endsWith('.git')) {
                remoteUrl = remoteUrl.slice(0, -4);
              }
            }
          } catch (e) {
            this.logger.warn('Failed to get remote URL', e);
          }

          const data = {
            repository: {
              name: repoName,
              fullName: repoName,
              owner: 'local',
              url: remoteUrl
            },
            branches: {
              head: {
                ref: branchName,
                sha: commitSha
              },
              base: {
                ref: 'main', // Assumption
                sha: ''
              }
            },
            changes: {
              summary: {
                files: uniqueFilesData.length,
                additions: uniqueFilesData.reduce((acc, f) => acc + f.additions, 0),
                deletions: uniqueFilesData.reduce((acc, f) => acc + f.deletions, 0)
              },
              commits: [],
              files: uniqueFilesData,
              fullDiff: fullDiff
            }
          };

          progress.report({ message: "Submitting review..." });
          
          // DON'T clear existing comments/threads for incremental reviews
          // Only clear if this is a full review (no filePaths specified)
          if (!filePaths) {
            this.logger.info('🗑️ Full review: clearing previous comments');
            this.commentThreads.forEach(thread => thread.dispose());
            this.commentThreads.clear();
            this.decoratedLines.clear();
            this.commentController.dispose();
            this.commentController = vscode.comments.createCommentController('beetle-review', 'Beetle AI Review');
            this.context.subscriptions.push(this.commentController);
          } else {
            this.logger.info('📝 Incremental review: keeping previous comments');
          }

          this.logger.info('🚀 Triggering review...');
          const response = await this.beetleService.triggerReview(data);
          
          if (!response) {
            this.logger.error('❌ No response from triggerReview');
            vscode.window.showErrorMessage('Failed to submit review');
            this.sendMessage({
              type: 'error',
              message: 'Failed to submit review'
            });
            return;
          }

          const { dataId, comments: initialComments } = response;
          this.logger.info(`✅ Review triggered successfully`, {
            dataId,
            initialCommentCount: initialComments.length
          });
          
          // Initialize session with ALL files AFTER starting analysis
          this.currentSession = {
            dataId: dataId,
            title: this.getReviewTitle(),
            branch: {
              from: branchName,
              to: 'main'
            },
            status: 'running',
            totalComments: 0,
            resolvedComments: 0,
            files: uniqueFilesData.map(file => {
              // Get current content hash (hash of the actual file content, not patch)
              const currentContentHash = this.calculateFileHash(file.lastReviewedContent || '');
              
              return {
                filePath: file.filename,
                comments: [],
                criticalCount: 0,
                highCount: 0,
                issueCount: 0,
                expanded: false, // Default to collapsed
                // Progressive review tracking - store file content hash, not patch hash
                lastReviewedHash: currentContentHash, // Hash of file content when reviewed
                lastReviewedPatch: file.patch,
                lastReviewedContent: file.lastReviewedContent, // Full file content when reviewed
                reviewedAt: new Date()
              };
            }),
            createdAt: new Date()
          };
          this.currentReviewId = dataId;
          
          // Send initial session to UI
          this.sendReviewSessionUpdate(this.currentSession);
          
          // Show initial comments
          this.logger.info(`📝 Processing ${initialComments.length} initial comments...`);
          initialComments.forEach((comment, index) => {
            this.logger.info(`Initial comment ${index + 1}:`, {
              hasContent: !!comment.content,
              contentLength: comment.content?.length || 0
            });
            this.createInlineComment(comment.content, repo.rootUri);
          });

          let totalComments = initialComments.length;
          
          if (totalComments > 0) {
            progress.report({ 
              message: `Analyzing... (${totalComments} comments received)`,
            });
          } else {
            progress.report({ message: "Analyzing code..." });
          }

          // Start polling for more comments
          this.logger.info(`🔄 Starting polling for dataId: ${dataId}`);
          this.beetleService.startCommentPolling(
            dataId,
            (comment) => {
              this.logger.info(`🆕 New comment received via polling:`, {
                hasContent: !!comment.content,
                file_path: comment.file_path,
                line_start: comment.line_start
              });
              
              totalComments++;
              
              // Add to inline comments
              this.createInlineComment(comment.content, repo.rootUri);
              
              // Add to session
              this.addCommentToSession(dataId, comment);
              
              progress.report({ 
                message: `Analyzing... (${totalComments} comments)`,
              });
            },
            () => {
              // Polling complete - check status
              this.logger.info(`✅ Comment polling completed for dataId: ${dataId}`);
              
              // Check final status and update session
              this.beetleService.getAnalysisStatus(dataId).then(statusData => {
                if (this.currentSession && this.currentSession.dataId === dataId) {
                  this.currentSession.status = statusData.analysis_status as 'running' | 'completed' | 'failed';
                  this.sendReviewSessionUpdate(this.currentSession);
                  
                  this.logger.info(`📊 Analysis status: ${statusData.analysis_status}`);
                  
                  // Notify UI that review is complete
                  if (statusData.analysis_status === 'completed') {
                    progress.report({ message: `✅ Review complete (${totalComments} comments)` });
                  } else if (statusData.analysis_status === 'failed') {
                    progress.report({ message: `❌ Review failed` });
                  }
                }
              }).catch(err => {
                this.logger.error('Failed to get analysis status', err);
              });
            }
          );
        } catch (err) {
          this.logger.error('Error preparing review', err);
          vscode.window.showErrorMessage('Failed to prepare review');
        }
      });
      
    } catch (error) {
      this.logger.error('Failed to trigger review', error);
      vscode.window.showErrorMessage('Failed to trigger review');
      this.sendMessage({
        type: 'error',
        message: 'Failed to trigger review'
      });
    }
  }


  private createInlineComment(content: string, rootUri: vscode.Uri) {
    try {
      this.logger.info('🔨 Creating inline comment...', { contentLength: content.length });
      
      // Parse content to extract file and line
      const fileMatch = content.match(/\*\*File\*\*:\s*`([^`]+)`/);
      const lineMatch = content.match(/\*\*Line_Start\*\*:\s*(\d+)/);
      
      if (!fileMatch || !lineMatch) {
        this.logger.warn('❌ Could not parse comment location');
        this.logger.warn('Content:', content.substring(0, 200));
        return;
      }

      const filePath = fileMatch[1].trim();
      const line = parseInt(lineMatch[1], 10) - 1; // VS Code is 0-indexed
      
      this.logger.info(`📍 Creating comment for:`, {
        file: filePath,
        line: line + 1,
        rootUri: rootUri.fsPath
      });
      
      const uri = vscode.Uri.joinPath(rootUri, filePath);
      const range = new vscode.Range(line, 0, line, 0);
      
      this.logger.info(`📁 Full URI:`, uri.fsPath);
      
      const thread = this.commentController.createCommentThread(uri, range, []);
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed; // Start collapsed
      thread.canReply = false; // Read-only
      thread.contextValue = 'beetleComment'; // Enable menu items
      
      this.logger.info(`✅ Comment thread created`);
      
      // Extract title first (before cleaning)
      const titleMatch = content.match(/\*\*Title\*\*:\s*(.+?)(?:\n|$)/);
      const title = titleMatch ? titleMatch[1].trim() : null;
      
      // Clean up content - remove only metadata fields at the top
      let cleanContent = content
        .replace(/\*\*File\*\*:\s*`[^`]+`\n?/, '')
        .replace(/\*\*Line_Start\*\*:\s*\d+\n?/, '')
        .replace(/\*\*Line_End\*\*:\s*\d+\n?/, '')
        .replace(/\*\*Severity\*\*:\s*\w+\n?/, '')
        .replace(/\*\*Confidence\*\*:\s*[^\n]+\n?/, '')
        .replace(/\*\*Title\*\*:\s*.+?\n?/, '') // Remove title from body
        .trim();

      // Convert HTML <details> to markdown headers (VS Code comments don't support HTML well)
      cleanContent = this.convertDetailsToMarkdown(cleanContent);
      
      // If title exists, prepend it as a prominent header
      if (title) {
        cleanContent = `## ${title}\n\n${cleanContent}`;
      }

      const newComment: vscode.Comment = {
        body: new vscode.MarkdownString(cleanContent, true),
        mode: vscode.CommentMode.Preview,
        author: { 
          name: 'Beetle', 
          iconPath: vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'beetle-icon.svg'))
        }
      };
      
      // Enable markdown features
      (newComment.body as vscode.MarkdownString).supportHtml = false; // Don't use HTML
      (newComment.body as vscode.MarkdownString).isTrusted = true;
      
      thread.comments = [newComment];
      
      // Store thread with key: "filePath:lineNumber"
      const threadKey = `${filePath}:${line + 1}`;
      this.commentThreads.set(threadKey, thread);
      
      // Add Beetle icon to gutter at this line
      this.applyGutterDecoration(uri, line);
      
      this.logger.info(`✅ Comment added to thread successfully`);
      
    } catch (e) {
      this.logger.error('❌ Error creating inline comment', e);
    }
  }

  /**
   * Convert HTML <details> tags to markdown-friendly format
   * VS Code comments don't render HTML properly, so we convert to headers
   */
  private convertDetailsToMarkdown(content: string): string {
    return content.replace(/<details>\s*<summary>(.*?)<\/summary>\s*([\s\S]*?)<\/details>/gi, (match, summary, body) => {
      // Convert to markdown with header and proper spacing
      const header = `\n\n**${summary.trim()}**\n`;
      const cleanBody = body.trim();
      
      return `${header}\n${cleanBody}\n`;
    });
  }

  /**
   * Apply Beetle gutter icon decoration to a specific line in a file
   */
  private applyGutterDecoration(uri: vscode.Uri, line: number): void {
    const filePath = uri.fsPath;
    
    // Add this line to the tracked lines for this file
    const currentLines = this.decoratedLines.get(filePath) || [];
    if (!currentLines.includes(line)) {
      currentLines.push(line);
      this.decoratedLines.set(filePath, currentLines);
    }
    
    // Find the editor for this file
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
    
    if (editor) {
      // Create ranges for all decorated lines in this file
      const ranges = currentLines.map(l => new vscode.Range(l, 0, l, 0));
      editor.setDecorations(this.gutterDecorationType, ranges);
      this.logger.info(`🎨 Applied gutter icons to ${ranges.length} lines in ${path.basename(filePath)}`);
    }
  }

  /**
   * Send message to webview
   */
  private sendMessage(message: ExtensionMessage): void {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  /**
   * Get webview HTML content with React app
   */
  private getWebviewContent(): string {
    const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');
    
    // Get URIs for resources
    const scriptUri = this.view!.webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, 'index.js'))
    );
    const styleUri = this.view!.webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, 'index.css'))
    );
    
    // Get URI for beetle.png image
    const beetleImageUri = this.view!.webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, 'beetle.png'))
    );

    // Use a nonce to whitelist scripts
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.view!.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${this.view!.webview.cspSource} data:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Beetle</title>
  <script nonce="${nonce}">
    window.beetleImageUri = "${beetleImageUri}";
  </script>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Initialize Git integration
   */
  private async initializeGit(): Promise<void> {
    try {
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!gitExtension) {
        this.logger.warn('Git extension not found');
        this.sendMessage({ type: 'error', message: 'Git extension not found' });
        return;
      }

      if (!gitExtension.isActive) {
        this.logger.info('Activating Git extension');
        await gitExtension.activate();
      }

      const git = gitExtension.exports.getAPI(1);
      this.gitAPI = git;
      
      this.sendMessage({ type: 'log', message: `Git API initialized. Repos found: ${git.repositories.length}` });

      // Handle initial repositories
      if (git.repositories.length > 0) {
        this.logger.info('Found initial repositories', { count: git.repositories.length });
        const repo = git.repositories[0];
        const repoPath = repo.rootUri.fsPath;
        
        // Initialize staged count
        this.previousStagedCount = repo.state.indexChanges.length;
        
        // Attach state change listener to initial repo (only once per repo)
        if (!this.attachedRepoListeners.has(repoPath)) {
          this.attachRepoStateListener(repo);
          this.attachedRepoListeners.add(repoPath);
        }
        
        await this.updateRepoInfo(repo);
      } else {
        this.logger.info('No initial repositories found, waiting for open...');
        this.sendMessage({ type: 'log', message: 'No initial repositories found, waiting for open...' });
      }

      // Listen for newly opened repos
      git.onDidOpenRepository((repo) => {
        const repoPath = repo.rootUri.fsPath;
        this.logger.info('Repository opened', { root: repoPath });
        this.sendMessage({ type: 'log', message: `Repository opened: ${repoPath}` });
        
        // Initialize staged count for new repo
        this.previousStagedCount = repo.state.indexChanges.length;
        
        // Attach state change listener only if not already attached for this repo
        if (!this.attachedRepoListeners.has(repoPath)) {
          this.attachRepoStateListener(repo);
          this.attachedRepoListeners.add(repoPath);
        }
        
        this.updateRepoInfo(repo);
      });

    } catch (error) {
      this.logger.error('Failed to initialize Git', error);
      this.sendMessage({ type: 'error', message: `Failed to initialize Git: ${error}` });
    }
  }

  /**
   * Attach state change listener to a repository for staging detection
   */
  private attachRepoStateListener(repo: GitRepository): void {
    repo.state.onDidChange(async () => {
      this.logger.info('Repository state changed');
      
      // Check if new files were staged
      const currentStagedCount = repo.state.indexChanges.length;
      
      if (currentStagedCount > this.previousStagedCount && currentStagedCount > 0) {
        this.logger.info(`New files staged: ${currentStagedCount - this.previousStagedCount}`);
        
        // Show notification popup
        const action = await vscode.window.showInformationMessage(
          'You have staged changes! Run a review with Beetle.',
          'Start Review all changes'
        );
        
        if (action === 'Start Review all changes') {
          // Focus and reveal the Beetle panel
          vscode.commands.executeCommand(`${VIEW_ID_MAIN}.focus`);
          // Trigger review
          this.handleTriggerReview();
        }
      }
      
      this.previousStagedCount = currentStagedCount;
      await this.updateRepoInfo(repo);
    });
  }

  /**
   * Update repository info and send to webview
   */
  private async updateRepoInfo(repo: GitRepository): Promise<void> {
    try {
      // Get repo info
      const repoName = path.basename(repo.rootUri.fsPath);
      const branchName = repo.state.HEAD?.name;

      this.logger.info('Updating repo info', { repoName, branchName });

      if (!branchName) {
        this.logger.warn('No branch found');
        return;
      }

      // Send repo info
      this.sendMessage({
        type: 'repositoriesData',
        repositories: [{
          id: repo.rootUri.fsPath,
          name: repoName,
          fullName: repoName,
          owner: 'local',
          url: repo.rootUri.fsPath
        }]
      });

      // Send branch info
      this.sendMessage({
        type: 'branchesData',
        branches: [{
          name: branchName,
          sha: repo.state.HEAD?.commit || '',
          protected: false
        }]
      });

      // Get changed files (working tree + index)
      const changes = [
        ...repo.state.workingTreeChanges,
        ...repo.state.indexChanges
      ];
      
      this.logger.info('Found changes', { count: changes.length });

      // Map to ReviewFile format with patches and hashes
      const cwd = repo.rootUri.fsPath;
      const reviewFiles = await Promise.all(changes.map(async (change) => {
        const filePath = vscode.workspace.asRelativePath(change.uri);
        
        // Get current file content for hash calculation
        let currentContent = '';
        try {
          currentContent = await fs.promises.readFile(path.join(cwd, filePath), 'utf8');
        } catch (e) {
          this.logger.warn(`Failed to read content for ${filePath}`, e);
        }
        
        // Get diff/content for this file
        let patch = '';
        const isUntracked = change.status === 7; // UNTRACKED
        
        try {
          if (isUntracked) {
            // For untracked files, git diff HEAD fails, so we use the file content
            patch = currentContent; // Use content as patch for untracked files
          } else {
            // For tracked files, get diff against HEAD
            const { stdout } = await exec(`git diff HEAD -- "${filePath}"`, { cwd });
            patch = stdout;
            this.logger.info(`Fetched diff for ${filePath}: ${patch.length} chars`);
          }
        } catch (e) {
          this.logger.warn(`Failed to get diff/content for ${filePath}`, e);
        }
        
        // Calculate additions/deletions
        let additions = 0;
        let deletions = 0;
        
        if (isUntracked) {
          // For untracked, all lines are additions
          additions = currentContent.split('\n').length;
        } else {
          additions = (patch.match(/^\+/gm) || []).length - 1;
          deletions = (patch.match(/^-/gm) || []).length - 1;
        }
        
        return {
          path: filePath,
          status: this.mapGitStatus(change.status),
          additions: Math.max(0, additions),
          deletions: Math.max(0, deletions),
          patch,
          contentHash: this.calculateFileHash(currentContent), // Hash of FILE CONTENT, not patch
          expanded: false // Default to collapsed
        };
      }));

      // Remove duplicates (file could be in both index and working tree)
      // Also filter out excluded file types (images, videos, markdown, etc.)
      const uniqueFiles = Array.from(new Map(reviewFiles.map(f => [f.path, f])).values())
        .filter(f => !this.shouldExcludeFile(f.path));

      this.sendMessage({
        type: 'reviewFilesData',
        files: uniqueFiles,
        count: uniqueFiles.length
      });

    } catch (error) {
      this.logger.error('Failed to update repo info', error);
    }
  }

  /**
   * Provide content for beetle-original scheme
   * For incremental reviews: returns lastReviewedContent (shows only new changes)
   * For first-time reviews: returns HEAD content (shows all changes)
   */
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
        return '';
      }
      
      const repo = this.gitAPI.repositories[0];
      const cwd = repo.rootUri.fsPath;
      
      // uri.path is /relative/path/to/file
      // Remove leading slash
      const relPath = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;
      
      // PRIORITY 1: Check for lastReviewedContent from most recent session (for incremental diff)
      // This shows only the NEW changes since last review, not all changes from HEAD
      for (const session of this.sessions) {
        const sessionFile = session.files.find((f: any) => f.filePath === relPath);
        
        if (sessionFile && sessionFile.lastReviewedContent) {
          this.logger.info(`📋 Using lastReviewedContent for ${relPath} from session ${session.dataId} (incremental diff)`);
          return sessionFile.lastReviewedContent;
        }
      }
      
      // PRIORITY 2: Check if file was untracked in previous session
      for (let i = this.sessions.length - 1; i >= 0; i--) {
        const session = this.sessions[i];
        const sessionFile = session.files.find((f: any) => f.filePath === relPath);
        
        // If file was untracked in previous session, use its content as base
        // Status 'U' comes from mapGitStatus for untracked files
        if (sessionFile && sessionFile.status === 'U' && sessionFile.lastReviewedPatch) {
          this.logger.info(`Found previous untracked content for ${relPath} in session ${session.dataId}`);
          return sessionFile.lastReviewedPatch;
        }
      }

      // PRIORITY 3: Check if file is currently untracked (new file, no previous review)
      const change = repo.state.workingTreeChanges.find(c => c.uri.path.endsWith(relPath));
      const isUntracked = change && change.status === 7;

      if (isUntracked) {
        this.logger.info(`New untracked file ${relPath} - returning empty for diff`);
        return ''; // No previous review, return empty (new file)
      }
      
      // PRIORITY 4: Fallback to HEAD content (first-time review, no previous session)
      try {
        const { stdout } = await exec(`git show HEAD:"${relPath}"`, { cwd });
        this.logger.info(`Using HEAD content for ${relPath} (first-time review)`);
        return stdout;
      } catch (e) {
        this.logger.warn(`Failed to get HEAD content for ${relPath}`, e);
        return ''; // Return empty if fails
      }
    } catch (error) {
      this.logger.error('Error providing document content', error);
      return '';
    }
  }

  /**
   * Handle open file - Opens Diff View
   */
  private async handleOpenFile(file: ReviewFile): Promise<void> {
    try {
      if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
        return;
      }
      
      const repo = this.gitAPI.repositories[0];
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      
      if (!workspaceFolder) {
        return;
      }
      
      // Left side: Original (HEAD)
      // Use custom scheme to provide content
      const originalUri = vscode.Uri.parse(`beetle-original:///${file.path}`);
      
      // Right side: Current (Working Tree)
      const currentUri = vscode.Uri.joinPath(workspaceFolder.uri, file.path);
      
      const fileName = path.basename(file.path);
      const title = `Changes being reviewed: ${fileName}`;
      
      this.logger.info(`Opening diff view for ${file.path}`);
      
      // Open Diff View
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        currentUri,
        title,
        { preview: false }
      );
      
    } catch (error) {
      this.logger.error('Failed to open file', error);
      vscode.window.showErrorMessage('Failed to open file diff');
    }
  }
  private async handleNavigateToComment(filePath: string, line: number): Promise<void> {
    try {
      if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
        return;
      }
      
      const repo = this.gitAPI.repositories[0];
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      
      if (!workspaceFolder) {
        return;
      }
      
      const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
      this.logger.info(`Navigating to ${fullPath.fsPath} line ${line}`);
      
      const document = await vscode.workspace.openTextDocument(fullPath);
      const editor = await vscode.window.showTextDocument(document);
      
      // Move cursor to line (0-indexed)
      const position = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      
      // Find and reveal the comment thread at this location
      const threadKey = `${filePath}:${line}`;
      const thread = this.commentThreads.get(threadKey);
      
      if (thread) {
        // Expand the thread to show the full comment
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        thread.canReply = false; // Keep it read-only
        
        this.logger.info(`✅ Expanded comment thread at ${threadKey}`);
      } else {
        this.logger.warn(`⚠️ No comment thread found for ${threadKey}`);
      }
      
    } catch (error) {
      this.logger.error('Failed to navigate to comment', error);
    }
  }
  
  /**
   * Toggle file expansion in review session
   */
  /**
   * Toggle file expansion in review session
   */
  private handleToggleFile(filePath: string, sessionId?: string): void {
    let session = this.currentSession;
    
    // If sessionId provided, find that session
    if (sessionId) {
      session = this.sessions.find(s => s.dataId === sessionId) || this.currentSession;
    }
    
    if (!session) {
      return;
    }
    
    const fileGroup = session.files.find((f: any) => f.filePath === filePath);
    if (fileGroup) {
      fileGroup.expanded = !fileGroup.expanded;
      this.sendReviewSessionUpdate(session);
    }
  }
  
  /**
   *Add comment to review session (groups by file)
   */
  private addCommentToSession(dataId: string, commentData: any): void {
    // Session should already exist from handleTriggerReview
    if (!this.currentSession) {
      this.logger.warn('No current session found when adding comment');
      return;
    }
    
    // Update dataId if it was 'initializing'
    if (this.currentSession.dataId === 'initializing') {
      this.currentSession.dataId = dataId;
      this.currentReviewId = dataId;
    }
    
    // Parse severity from content
    const severity = this.extractSeverity(commentData.content);
    
    const comment = {
      id: `${dataId}-${Date.now()}`,
      file_path: commentData.file_path,
      line_start: commentData.line_start,
      line_end: commentData.line_end,
      severity,
      title: commentData.title,
      confidence: commentData.confidence || '3/5',
      content: commentData.content,
      created_at: new Date()
    };
    
    // Find file group (should already exist from initialization)
    let fileGroup = this.currentSession.files.find((f: any) => f.filePath === comment.file_path);
    
    if (!fileGroup) {
      // Fallback: create if somehow missing
      this.logger.warn(`File group not found for ${comment.file_path}, creating it`);
      fileGroup = {
        filePath: comment.file_path,
        comments: [],
        criticalCount: 0,
        highCount: 0,
        issueCount: 0,
        expanded: false // Default to collapsed
      };
      this.currentSession.files.push(fileGroup);
    }
    
    // Add comment
    fileGroup.comments.push(comment);
    
    // Update counts
    if (severity === 'Critical') {
      fileGroup.criticalCount++;
      fileGroup.issueCount++;
    } else if (severity === 'High') {
      fileGroup.highCount++;
      fileGroup.issueCount++;
    }
    
    this.currentSession.totalComments++;
    
    // Send update to webview
    this.sendReviewSessionUpdate(this.currentSession);
  }
  
  /**
   * Extract severity from comment content
   */
  private extractSeverity(content: string): 'Critical' | 'High' | 'Medium' | 'Low' {
    const severityMatch = content.match(/\*\*Severity\*\*:\s*(\w+)/);
    if (severityMatch) {
      const severity = severityMatch[1];
      if (['Critical', 'High', 'Medium', 'Low'].includes(severity)) {
        return severity as any;
      }
    }
    
    // Fallback: check for keywords
    if (content.toLowerCase().includes('critical') || content.toLowerCase().includes('security')) {
      return 'Critical';
    }
    if (content.toLowerCase().includes('warning') || content.toLowerCase().includes('potential issue')) {
      return 'High';
    }
    if (content.toLowerCase().includes('suggestion')) {
      return 'Medium';
    }
    
    return 'Low';
  }
  
  /**
   * Get review title for session
   */
  /**
   * Calculate hash of file content for change detection
   */
  private calculateFileHash(content: string): string {
    if (!content || content.trim() === '') {
      return '';
    }
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Create a temporary file with content
   */
  private async createTempFile(content: string): Promise<string> {
    const tmpDir = os.tmpdir();
    const filename = `beetle-diff-${Date.now()}-${Math.random().toString(36).substring(7)}.tmp`;
    const filePath = path.join(tmpDir, filename);
    await fs.promises.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  /**
   * Get incremental diff between two content strings using git diff --no-index
   */
  private async getIncrementalDiff(oldContent: string, newContent: string, filename: string): Promise<string> {
    let oldFile = '';
    let newFile = '';
    
    try {
      oldFile = await this.createTempFile(oldContent);
      newFile = await this.createTempFile(newContent);
      
      // git diff --no-index oldFile newFile
      // We use --no-index to compare two arbitrary files
      // We use --unified=3 (default) for context
      const { stdout } = await exec(`git diff --no-index -- "${oldFile}" "${newFile}"`, { 
        cwd: os.tmpdir() // Run in tmp to avoid repo config interference
      });
      
      return stdout;
    } catch (error: any) {
      // git diff returns exit code 1 if differences are found, which exec treats as error
      if (error.code === 1 && error.stdout) {
        // Fix the header lines to match the actual filename instead of temp filenames
        let diff = error.stdout as string;
        const lines = diff.split('\n');
        
        // Replace the --- and +++ lines
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          if (lines[i].startsWith('--- ')) {
            lines[i] = `--- a/${filename}`;
          } else if (lines[i].startsWith('+++ ')) {
            lines[i] = `+++ b/${filename}`;
          }
        }
        return lines.join('\n');
      }
      
      this.logger.warn('Error calculating incremental diff', error);
      return ''; // Return empty if real error or no diff
    } finally {
      // Cleanup temp files
      if (oldFile) {
        await fs.promises.unlink(oldFile).catch(() => {});
      }
      if (newFile) {
        await fs.promises.unlink(newFile).catch(() => {});
      }
    }
  }
  
  /**
   * Send review session update to webview
   */
  private sendReviewSessionUpdate(session: any): void {
    // Add or update session in the array
    const existingIndex = this.sessions.findIndex(s => s.dataId === session.dataId);
    if (existingIndex >= 0) {
      // Update existing session
      this.sessions[existingIndex] = session;
    } else {
      // Add new session at the beginning (newest first)
      this.sessions.unshift(session);
    }
    
    this.sendMessage({
      type: 'reviewSessionsUpdated',
      sessions: this.sessions, // Send ALL sessions
      currentSessionId: this.currentSession?.dataId || null // Send ACTUAL current session, not just the updated one
    });
    
    // Save to storage for persistence
    this.saveCachedSessions();
  }
  
  /**
   * Check if there are uncommitted changes
   */
  private hasChanges(): boolean {
    if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
      return false;
    }
    
    const repo = this.gitAPI.repositories[0];
    const currentBranch = repo.state.HEAD?.name || '';
    const currentCommit = repo.state.HEAD?.commit || '';
    
    const changedFiles = [
      ...repo.state.workingTreeChanges,
      ...repo.state.indexChanges
    ];
    
    const filesHash = changedFiles
      .map(f => f.uri.fsPath)
      .sort()
      .join('|');
    
    // First review
    if (!this.lastReviewState) {
      return changedFiles.length > 0;
    }
    
    // Check if anything changed
    return (
      currentBranch !== this.lastReviewState.branch ||
      currentCommit !== this.lastReviewState.commit ||
      filesHash !== this.lastReviewState.filesHash
    );
  }
  
  /**
   * Update last review state
   */
  private updateReviewState(): void {
    if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
      return;
    }
    
    const repo = this.gitAPI.repositories[0];
    const changedFiles = [
      ...repo.state.workingTreeChanges,
      ...repo.state.indexChanges
    ];
    
    this.lastReviewState = {
      branch: repo.state.HEAD?.name || '',
      commit: repo.state.HEAD?.commit || '',
      filesHash: changedFiles.map(f => f.uri.fsPath).sort().join('|')
    };
    
    // Send change state to webview
    this.sendMessage({
      type: 'changesStateUpdate',
      hasChanges: false  // No changes right after review
    });
  }
  
  /**
   * Save current session to extension storage
   */
  private saveCachedSessions(): void {
    if (this.sessions.length > 0) {
      this.context.workspaceState.update('beetleSessions', this.sessions);
      this.logger.info(`💾 Saved ${this.sessions.length} session(s) to workspace cache`);
    } else {
      this.context.workspaceState.update('beetleSessions', null);
      this.logger.info(`💾 Cleared cached sessions from workspace`);
    }
  }
  
  /**
   * Restore session from extension storage and recreate inline comments
   */
  private restoreCachedSessions(): void {
    const savedSessions = this.context.workspaceState.get<any[] | null>('beetleSessions', null);
    
    if (savedSessions && savedSessions.length > 0) {
      this.logger.info(`📂 Restoring ${savedSessions.length} cached session(s)`);
      
      // Restore all sessions
      this.sessions = savedSessions;
      this.currentSession = savedSessions[0]; // Most recent
      
      // Send sessions to webview
      this.sendMessage({
        type: 'reviewSessionsUpdated',
        sessions: this.sessions,
        currentSessionId: this.currentSession.dataId
      });
      
      // Recreate inline comments for all sessions
      savedSessions.forEach(session => {
        this.restoreInlineComments(session);
      });
      
      this.logger.info(`✅ Restored ${savedSessions.length} session(s)`);
    }
  }
  
  /**
   * Handle mark resolved action from toolbar
   */
  public async handleMarkResolved(thread: vscode.CommentThread): Promise<void> {
    this.logger.info('Mark resolved clicked', { uri: thread.uri.fsPath, range: thread.range });
    
    try {
      // Safety check for thread.range
      if (!thread.range) {
        this.logger.warn('Thread has no range');
        return;
      }
      
      // Get the file path and line number from the thread
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return;
      }
      
      const filePath = vscode.workspace.asRelativePath(thread.uri);
      const line = thread.range.start.line + 1; // Convert to 1-indexed
      
      // Find and update the comment in the session
      if (this.currentSession) {
        let commentFound = false;
        
        for (const fileGroup of this.currentSession.files) {
          const commentIndex = fileGroup.comments.findIndex(
            (c: any) => c.file_path === filePath && c.line_start === line
          );
          
          if (commentIndex !== -1) {
            // Mark comment as resolved
            fileGroup.comments[commentIndex].resolved = true;
            this.currentSession.resolvedComments++;
            commentFound = true;
            
            // Send update to webview
            this.sendReviewSessionUpdate(this.currentSession);
            
            this.logger.info('Comment marked as resolved in session', {
              filePath,
              line,
              resolvedCount: this.currentSession.resolvedComments,
              totalCount: this.currentSession.totalComments
            });
            
            break;
          }
        }
        
        if (!commentFound) {
          this.logger.warn('Comment not found in session', { filePath, line });
        }
      }
      
      // Dispose the comment thread to remove it from the editor
      thread.dispose();
      
      // Remove from tracked threads
      const threadKey = `${filePath}:${line}`;
      this.commentThreads.delete(threadKey);
      
      vscode.window.showInformationMessage('✓ Comment marked as resolved');
      this.logger.info('Comment thread disposed');
      
    } catch (error) {
      this.logger.error('Error marking comment as resolved', error);
      vscode.window.showErrorMessage('Failed to mark as resolved');
    }
  }

  /**
   * Handle fix with AI action from toolbar
   */
  public async handleFixWithAI(thread: vscode.CommentThread): Promise<void> {
    this.logger.info('Fix with AI clicked');
    
    try {
      // Get the comment content
      if (!thread.comments || thread.comments.length === 0) {
        vscode.window.showWarningMessage('No comment content found');
        return;
      }
      
      const comment = thread.comments[0];
      const content = comment.body instanceof vscode.MarkdownString 
        ? comment.body.value 
        : String(comment.body);
      
      // Extract the "Prompt for AI" section
      const promptMatch = content.match(/\*\*Prompt for AI\*\*\s*([\s\S]*?)(?:\n\n##|\n\n\*\*|$)/);
      
      if (!promptMatch || !promptMatch[1]) {
        vscode.window.showWarningMessage('No AI prompt found in comment');
        this.logger.warn('No Prompt for AI section found in comment');
        return;
      }
      
      const aiPrompt = promptMatch[1].trim();
      
      // Copy to clipboard
      await vscode.env.clipboard.writeText(aiPrompt);
      
      vscode.window.showInformationMessage('✨ AI prompt copied to clipboard!');
      this.logger.info('AI prompt copied to clipboard', { promptLength: aiPrompt.length });
      
    } catch (error) {
      this.logger.error('Error extracting AI prompt', error);
      vscode.window.showErrorMessage('Failed to copy AI prompt');
    }
  }

  /**
   * Restore inline comments from session data
   */
  private restoreInlineComments(session: any): void {
    if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
      this.logger.warn('Cannot restore comments: No Git repository');
      return;
    }
    
    const repo = this.gitAPI.repositories[0];
    let restoredCount = 0;
    
    this.logger.info(`🔄 Restoring inline comments for ${session.files.length} files...`);
    
    // Clear existing comment controller, threads, and decorations
    this.commentThreads.clear();
    this.decoratedLines.clear();
    this.commentController.dispose();
    this.commentController = vscode.comments.createCommentController('beetle-review', 'Beetle AI Review');
    this.context.subscriptions.push(this.commentController);
    
    // Recreate all comments
    session.files.forEach((fileGroup: any) => {
      fileGroup.comments.forEach((comment: any) => {
        try {
          this.createInlineComment(comment.content, repo.rootUri);
          restoredCount++;
        } catch (error) {
          this.logger.error(`Failed to restore comment for ${comment.file_path}`, error);
        }
      });
    });
    
    this.logger.info(`✅ Restored ${restoredCount} inline comments`);
  }

  private mapGitStatus(status: number): 'added' | 'modified' | 'deleted' {
    // Simplified mapping. 1=INDEX_MODIFIED, 2=INDEX_ADDED, 3=INDEX_DELETED, etc.
    // 5=MODIFIED, 6=DELETED, 7=UNTRACKED
    switch (status) {
      case 2: // INDEX_ADDED
      case 7: // UNTRACKED
        return 'added';
      case 3: // INDEX_DELETED
      case 6: // DELETED
        return 'deleted';
      default:
        return 'modified';
    }
  }

  /**
   * Check if a file should be excluded from review based on its extension
   */
  private shouldExcludeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return EXCLUDED_EXTENSIONS.includes(ext);
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    // Cleanup if needed
  }
}

// Git API Interfaces
interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: GitRepositoryState;
}

interface GitRepositoryState {
  HEAD: { name?: string; commit?: string } | undefined;
  workingTreeChanges: GitChange[];
  indexChanges: GitChange[];
  onDidChange: vscode.Event<void>;
}

interface GitChange {
  uri: vscode.Uri;
  status: number;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
