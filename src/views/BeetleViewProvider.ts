import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as util from 'util';
import { AuthenticationProvider } from '../authentication/AuthenticationProvider';
import { BeetleService } from '../services/BeetleService';
import { Logger } from '../utils/logger';
import { WebviewMessage, ExtensionMessage, ReviewFile } from '../types';
import { VIEW_ID_MAIN } from '../utils/constants';

const exec = util.promisify(cp.exec);

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
  
  // Review session management - only store ONE session
  private currentSession: any | null = null;
  private currentReviewId: string | null = null;
  private lastReviewState: {
    branch: string;
    commit: string;
    filesHash: string;
  } | null = null;

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

    // Initialize Git integration
    this.initializeGit();

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
        await this.handleTriggerReview();
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
          this.handleToggleFile(message.filePath);
        }
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
      this.sendMessage({
        type: 'userData',
        user
      });
    } catch (error) {
      this.logger.error('Failed to load user data', error);
      this.sendMessage({
        type: 'error',
        message: 'Failed to load user data'
      });
    }
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
   * Handle open file
   */
  private async handleOpenFile(file: ReviewFile): Promise<void> {
    try {
      if (!this.gitAPI || this.gitAPI.repositories.length === 0) return;
      const repo = this.gitAPI.repositories[0];
      const fileUri = vscode.Uri.joinPath(repo.rootUri, file.path);
      
      // Open diff view (working tree)
      await vscode.commands.executeCommand('git.openChange', fileUri);
    } catch (error) {
      this.logger.error('Failed to open file', error);
      vscode.window.showErrorMessage('Failed to open file');
    }
  }

  /**
   * Handle trigger review
   */
  private async handleTriggerReview(): Promise<void> {
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
            
            // Get diff for this file
            let patch = '';
            try {
              const { stdout } = await exec(`git diff HEAD -- "${filePath}"`, { cwd });
              patch = stdout;
            } catch (e) {
              this.logger.warn(`Failed to get diff for ${filePath}`, e);
            }

            // Estimate additions/deletions from patch
            const additions = (patch.match(/^\+/gm) || []).length - 1; // -1 for the file header +++
            const deletions = (patch.match(/^-/gm) || []).length - 1; // -1 for the file header ---

            return {
              filename: filePath,
              status,
              additions: Math.max(0, additions),
              deletions: Math.max(0, deletions),
              patch
            };
          }));

          // Remove duplicates
          const uniqueFilesData = Array.from(new Map(filesData.map(f => [f.filename, f])).values());

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
          
          // Clear existing comments, threads, and gutter decorations
          this.commentThreads.clear();
          this.decoratedLines.clear();
          this.commentController.dispose();
          this.commentController = vscode.comments.createCommentController('beetle-review', 'Beetle AI Review');
          this.context.subscriptions.push(this.commentController);

          this.logger.info('🚀 Triggering review...');
          const response = await this.beetleService.triggerReview(data);
          
          if (!response) {
            this.logger.error('❌ No response from triggerReview');
            vscode.window.showErrorMessage('Failed to submit review');
            return;
          }

          const { dataId, comments: initialComments } = response;
          this.logger.info(`✅ Review triggered successfully`, {
            dataId,
            initialCommentCount: initialComments.length
          });
          
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
              
              // Add to review session (for UI)
              this.addCommentToSession(dataId, comment);
              
              progress.report({ 
                message: `Analyzing... (${totalComments} comments received)`,
              });
            },
            () => {
              this.logger.info(`🏁 Polling complete. Total comments: ${totalComments}`);
              
              // Update review state (mark as no changes)
              this.updateReviewState();
              
              vscode.window.showInformationMessage(
                `✅ Review complete! ${totalComments} comments added.`
              );
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
      
      this.logger.info(`✅ Comment thread created`);
      
      // Clean up content - remove only metadata fields at the top
      let cleanContent = content
        .replace(/\*\*File\*\*:\s*`[^`]+`\n?/, '')
        .replace(/\*\*Line_Start\*\*:\s*\d+\n?/, '')
        .replace(/\*\*Line_End\*\*:\s*\d+\n?/, '')
        .replace(/\*\*Severity\*\*:\s*\w+\n?/, '')
        .replace(/\*\*Confidence\*\*:\s*[^\n]+\n?/, '')
        .trim();

      // Convert HTML <details> to markdown headers (VS Code comments don't support HTML well)
      cleanContent = this.convertDetailsToMarkdown(cleanContent);

      const newComment: vscode.Comment = {
        body: new vscode.MarkdownString(cleanContent, true),
        mode: vscode.CommentMode.Preview,
        author: { 
          name: 'Beetle AI', 
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

    // Use a nonce to whitelist scripts
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.view!.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Beetle</title>
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
        await this.updateRepoInfo(git.repositories[0]);
      } else {
        this.logger.info('No initial repositories found, waiting for open...');
        this.sendMessage({ type: 'log', message: 'No initial repositories found, waiting for open...' });
        
        // Wait for repo to be opened
        git.onDidOpenRepository(async (repo) => {
          this.logger.info('Repository opened', { root: repo.rootUri.fsPath });
          this.sendMessage({ type: 'log', message: `Repository opened: ${repo.rootUri.fsPath}` });
          await this.updateRepoInfo(repo);
        });
      }

      // Listen for repo changes
      git.onDidOpenRepository((repo) => {
        repo.state.onDidChange(async () => {
          this.logger.info('Repository state changed');
          await this.updateRepoInfo(repo);
        });
      });

    } catch (error) {
      this.logger.error('Failed to initialize Git', error);
      this.sendMessage({ type: 'error', message: `Failed to initialize Git: ${error}` });
    }
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

      // Map to ReviewFile format
      const reviewFiles = changes.map(change => {
        const filePath = vscode.workspace.asRelativePath(change.uri);
        return {
          path: filePath,
          status: this.mapGitStatus(change.status),
          additions: 0, // Git API doesn't give line counts easily without diff
          deletions: 0
        };
      });

      // Remove duplicates (file could be in both index and working tree)
      const uniqueFiles = Array.from(new Map(reviewFiles.map(f => [f.path, f])).values());

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
   * Navigate to comment location in editor and reveal the comment thread
   */
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
  private handleToggleFile(filePath: string): void {
    if (!this.currentSession) {
      return;
    }
    
    const fileGroup = this.currentSession.files.find((f: any) => f.filePath === filePath);
    if (fileGroup) {
      fileGroup.expanded = !fileGroup.expanded;
      this.sendReviewSessionUpdate(this.currentSession);
    }
  }
  
  /**
   *Add comment to review session (groups by file)
   */
  private addCommentToSession(dataId: string, commentData: any): void {
    if (!this.currentSession || this.currentSession.dataId !== dataId) {
      // Create new session (replaces old one)
      const repo = this.gitAPI?.repositories[0];
      this.currentSession = {
        dataId,
        title: this.getReviewTitle(),
        branch: {
          from: repo?.state.HEAD?.name || 'unknown',
          to: 'main'
        },
        status: 'running',
        totalComments: 0,
        resolvedComments: 0,
        files: [],
        createdAt: new Date()
      };
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
      confidence: commentData.confidence || '3/5',
      content: commentData.content,
      created_at: new Date()
    };
    
    // Find or create file group
    let fileGroup = this.currentSession.files.find((f: any) => f.filePath === comment.file_path);
    
    if (!fileGroup) {
      fileGroup = {
        filePath: comment.file_path,
        comments: [],
        criticalCount: 0,
        highCount: 0,
        issueCount: 0,
        expanded: true  // Auto-expand new files
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
  private getReviewTitle(): string {
    const repo = this.gitAPI?.repositories[0];
    if (!repo) {
      return 'Code Review';
    }
    
    const branchName = repo.state.HEAD?.name || 'unknown';
    return `Review: ${branchName}`;
  }
  
  /**
   * Send review session update to webview
   */
  private sendReviewSessionUpdate(session: any): void {
    this.sendMessage({
      type: 'reviewSessionUpdated',
      session
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
    if (this.currentSession) {
      this.context.globalState.update('beetleCurrentSession', this.currentSession);
      this.logger.info(`💾 Saved current session to cache`);
    } else {
      this.context.globalState.update('beetleCurrentSession', null);
      this.logger.info(`💾 Cleared cached session`);
    }
  }
  
  /**
   * Restore session from extension storage and recreate inline comments
   */
  private restoreCachedSessions(): void {
    const saved = this.context.globalState.get<any | null>('beetleCurrentSession', null);
    
    if (saved) {
      this.logger.info(`📂 Restoring cached session: ${saved.dataId}`);
      
      // Restore to current session
      this.currentSession = saved;
      
      // Send session to webview
      this.sendMessage({
        type: 'reviewSessionUpdated',
        session: saved
      });
      
      // Recreate inline comments
      this.restoreInlineComments(saved);
      
      this.logger.info(`✅ Restored session with ${saved.totalComments} comments`);
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
