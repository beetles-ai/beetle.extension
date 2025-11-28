import { useState, useEffect } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import type { User, ReviewFile } from '../types';
import Header from './Header';
import AccountSection from './AccountSection';
import RepositorySection from './RepositorySection';
import BranchSection from './BranchSection';
import FilesSection from './FilesSection';
import UpgradeSection from './UpgradeSection';

export default function DashboardView() {
  const vscode = useVSCode();
  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<ReviewFile[]>([]);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    const cleanup = vscode.onMessage((message) => {
      switch (message.type) {
        case 'userData':
          setUser(message.user);
          break;
        case 'reviewFilesData':
          setFiles(message.files);
          setFileCount(message.count);
          break;
        case 'error':
          console.error('Error from extension:', message.message);
          break;
      }
    });

    return cleanup;
  }, [vscode]);

  const handleSettings = () => {
    vscode.postMessage({ type: 'openSettings' });
  };

  return (
    <div className="p-4">
      <Header onSettings={handleSettings} />
      <AccountSection user={user} />
      <RepositorySection />
      <BranchSection />
      <FilesSection files={files} fileCount={fileCount} />
      {user?.planType === 'FREE' && <UpgradeSection />}
    </div>
  );
}
