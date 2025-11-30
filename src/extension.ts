import * as vscode from 'vscode';
import { AuthenticationProvider } from './authentication/AuthenticationProvider';
import { ApiClient } from './services/ApiClient';
import { BeetleService } from './services/BeetleService';
import { BeetleViewProvider } from './views/BeetleViewProvider';
import { Logger } from './utils/logger';
import { VIEW_ID_MAIN, BEETLE_URI_AUTHORITY, BEETLE_AUTH_CALLBACK_PATH } from './utils/constants';

let logger: Logger;

/**
 * This method is called when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext) {
	// Initialize logger
	logger = new Logger('Beetle');
	logger.info('Activating Beetle extension');

	try {
		// Initialize authentication provider
		const authProvider = new AuthenticationProvider(context, logger);
		
		// Initialize API client
		const apiClient = new ApiClient(authProvider, logger);
		
		// Initialize Beetle service
		const beetleService = new BeetleService(apiClient, logger);
		
		// Initialize view provider
		const viewProvider = new BeetleViewProvider(
			context,
			authProvider,
			beetleService,
			logger
		);

		// Register the sidebar view5
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider(VIEW_ID_MAIN, viewProvider)
		);

		// Register test command
		context.subscriptions.push(
			vscode.commands.registerCommand('beetle.test', () => {
				vscode.window.showInformationMessage('Beetle extension is working! ✅');
			})
		);
		
		// Register mark comment resolved command
		context.subscriptions.push(
			vscode.commands.registerCommand('beetle.markCommentResolved', (thread: vscode.CommentThread) => {
				viewProvider.handleMarkResolved(thread);
			})
		);
		
		// Register fix with AI command
		context.subscriptions.push(
			vscode.commands.registerCommand('beetle.fixWithAI', (thread: vscode.CommentThread) => {
				viewProvider.handleFixWithAI(thread);
			})
		);
		
		// Register URI handler for OAuth callback
		context.subscriptions.push(
			vscode.window.registerUriHandler({
				handleUri(uri: vscode.Uri): void {
					logger.info('URI handler called', uri.toString());
					
					// Check if this is an auth callback
					if (uri.authority === BEETLE_URI_AUTHORITY && uri.path === BEETLE_AUTH_CALLBACK_PATH) {
						authProvider.handleCallback(uri);
					}
				}
			})
		);

		// Register disposal for logger
		context.subscriptions.push({
			dispose: () => logger.dispose()
		});

		logger.info('Beetle extension activated successfully');
	} catch (error) {
		logger.error('Failed to activate Beetle extension', error);
		vscode.window.showErrorMessage('Failed to activate Beetle extension');
	}
}

/**
 * This method is called when the extension is deactivated
 */
export function deactivate() {
	if (logger) {
		logger.info('Deactivating Beetle extension');
		logger.dispose();
	}
}

