import { useEffect, useCallback } from 'react';
import type { WebviewMessage, ExtensionMessage } from '../types';

// Declare vscode API globally
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: WebviewMessage) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

// Get VS Code API instance (singleton)
const vscodeApi = (() => {
  if (typeof window.acquireVsCodeApi === 'function') {
    return window.acquireVsCodeApi();
  }
  // Fallback for development
  return {
    postMessage: (message: WebviewMessage) => console.log('Mock postMessage:', message),
    getState: () => ({}),
    setState: (state: any) => console.log('Mock setState:', state),
  };
})();

export function useVSCode() {
  const postMessage = useCallback((message: WebviewMessage) => {
    vscodeApi.postMessage(message);
  }, []);

  const onMessage = useCallback((callback: (message: ExtensionMessage) => void) => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      callback(event.data);
    };

    window.addEventListener('message', handler);

    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);

  // Notify extension that webview is ready
  useEffect(() => {
    postMessage({ type: 'ready' });
  }, [postMessage]);

  return {
    postMessage,
    onMessage,
    getState: vscodeApi.getState,
    setState: vscodeApi.setState,
  };
}
