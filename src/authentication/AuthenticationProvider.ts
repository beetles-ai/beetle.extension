import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import {
  STORAGE_KEY_ACCESS_TOKEN,
  BEETLE_SIGNIN_URL,
  BEETLE_URI_SCHEME,
  BEETLE_URI_AUTHORITY,
  BEETLE_AUTH_CALLBACK_PATH
} from '../utils/constants';

export class AuthenticationProvider {
  private context: vscode.ExtensionContext;
  private logger: Logger;
  private authChangeEmitter = new vscode.EventEmitter<boolean>();
  public readonly onAuthStateChanged = this.authChangeEmitter.event;

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.context = context;
    this.logger = logger;
  }

  /**
   * Check if user is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== undefined && token.length > 0;
  }

  /**
   * Get the stored access token
   */
  public async getAccessToken(): Promise<string | undefined> {
    try {
      const token = await this.context.secrets.get(STORAGE_KEY_ACCESS_TOKEN);
      return token;
    } catch (error) {
      this.logger.error('Failed to retrieve access token', error);
      return undefined;
    }
  }

  /**
   * Initiate login flow - opens browser to signin page
   */
  public async login(): Promise<void> {
    try {
      this.logger.info('Initiating login flow');
      
      // Open browser to signin page
      // The web page should redirect to: SCHEME://beetle.beetle/auth-callback?token=ACCESS_TOKEN
      const scheme = vscode.env.uriScheme;
      const loginUrl = `${BEETLE_SIGNIN_URL}&scheme=${scheme}`;
      await vscode.env.openExternal(vscode.Uri.parse(loginUrl));
      
      vscode.window.showInformationMessage(
        'Please complete the login process in your browser. You will be redirected back to VS Code.'
      );
    } catch (error) {
      this.logger.error('Login failed', error);
      vscode.window.showErrorMessage('Failed to initiate login. Please try again.');
    }
  }

  /**
   * Handle the OAuth callback with token
   * This is called when the browser redirects to vscode://beetle.beetle/auth-callback?token=...
   */
  public async handleCallback(uri: vscode.Uri): Promise<void> {
    try {
      this.logger.info('Handling auth callback', uri.toString());

      // Parse the token from query parameters
      const query = new URLSearchParams(uri.query);
      const token = query.get('token');

      if (!token) {
        this.logger.error('No token found in callback URL');
        vscode.window.showErrorMessage('Authentication failed: No token received');
        return;
      }

      // Store the token securely
      await this.context.secrets.store(STORAGE_KEY_ACCESS_TOKEN, token);
      this.logger.info('Access token stored successfully');

      // Notify listeners that auth state changed
      this.authChangeEmitter.fire(true);

      vscode.window.showInformationMessage('Successfully logged in to Beetle!');
    } catch (error) {
      this.logger.error('Failed to handle auth callback', error);
      vscode.window.showErrorMessage('Authentication failed. Please try again.');
    }
  }

  /**
   * Logout - clear stored token
   */
  public async logout(): Promise<void> {
    try {
      this.logger.info('Logging out');
      await this.context.secrets.delete(STORAGE_KEY_ACCESS_TOKEN);
      
      // Notify listeners that auth state changed
      this.authChangeEmitter.fire(false);
      
      vscode.window.showInformationMessage('Logged out successfully');
    } catch (error) {
      this.logger.error('Logout failed', error);
      vscode.window.showErrorMessage('Failed to logout');
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.authChangeEmitter.dispose();
  }
}
