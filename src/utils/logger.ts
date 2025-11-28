import * as vscode from 'vscode';

export class Logger {
  private outputChannel: vscode.OutputChannel;

  constructor(channelName: string = 'Beetle') {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
  }

  public info(message: string, ...args: any[]): void {
    const formattedMessage = this.formatMessage('INFO', message, ...args);
    this.outputChannel.appendLine(formattedMessage);
    console.log(formattedMessage);
  }

  public error(message: string, ...args: any[]): void {
    const formattedMessage = this.formatMessage('ERROR', message, ...args);
    this.outputChannel.appendLine(formattedMessage);
    console.error(formattedMessage);
  }

  public warn(message: string, ...args: any[]): void {
    const formattedMessage = this.formatMessage('WARN', message, ...args);
    this.outputChannel.appendLine(formattedMessage);
    console.warn(formattedMessage);
  }

  public debug(message: string, ...args: any[]): void {
    const formattedMessage = this.formatMessage('DEBUG', message, ...args);
    this.outputChannel.appendLine(formattedMessage);
    console.debug(formattedMessage);
  }

  public show(): void {
    this.outputChannel.show();
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `[${timestamp}] [${level}] ${message}${argsStr}`;
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }
}
