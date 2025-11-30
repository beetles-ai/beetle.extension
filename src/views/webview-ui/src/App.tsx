import { useState, useEffect } from 'react';
import { useVSCode } from './hooks/useVSCode';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import './styles/index.css';

export default function App() {
  const vscode = useVSCode();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const cleanup = vscode.onMessage((message) => {
      if (message.type === 'authStateChanged') {
        setIsAuthenticated(message.isAuthenticated);
      }
    });

    return cleanup;
  }, [vscode]);

  // Send ready message when component mounts
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, [vscode]);

  return isAuthenticated ? <DashboardView /> : <LoginView />;
}
