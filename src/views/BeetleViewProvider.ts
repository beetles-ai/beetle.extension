import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AuthenticationProvider } from '../authentication/AuthenticationProvider';
import { BeetleService } from '../services/BeetleService';
import { Logger } from '../utils/logger';
import { WebviewMessage, ExtensionMessage } from '../types';
import { VIEW_ID_MAIN } from '../utils/constants';

export class BeetleViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private authProvider: AuthenticationProvider;
  private beetleService: BeetleService;
  private logger: Logger;

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

      case 'triggerReview':
        await this.handleTriggerReview();
        break;

      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'beetle');
        break;

      case 'openUpgrade':
        vscode.env.openExternal(vscode.Uri.parse('https://beetleai.dev/pricing'));
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
   * Handle trigger review
   */
  private async handleTriggerReview(): Promise<void> {
    try {
      vscode.window.showInformationMessage('Triggering code review...');
      this.logger.info('Review triggered');
    } catch (error) {
      this.logger.error('Failed to trigger review', error);
      vscode.window.showErrorMessage('Failed to trigger review');
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
        return;
      }

      const git = gitExtension.exports.getAPI(1);
      
      // Handle initial repositories
      if (git.repositories.length > 0) {
        await this.updateRepoInfo(git.repositories[0]);
      } else {
        // Wait for repo to be opened
        git.onDidOpenRepository(async (repo) => {
          await this.updateRepoInfo(repo);
        });
      }

      // Listen for repo changes
      git.onDidOpenRepository((repo) => {
        repo.state.onDidChange(async () => {
          await this.updateRepoInfo(repo);
        });
      });

    } catch (error) {
      this.logger.error('Failed to initialize Git', error);
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

      if (!branchName) return;

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

