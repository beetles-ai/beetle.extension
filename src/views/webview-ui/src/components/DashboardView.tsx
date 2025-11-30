import { useState, useEffect } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import type { User, ReviewFile, Repository, Branch, ReviewSession } from '../types';
import Header from './Header';
import AccountSection from './AccountSection';
import BranchSection from './BranchSection';
import FilesSection from './FilesSection';
import UpgradeSection from './UpgradeSection';
import ReviewSessionsList from './ReviewSessionsList';

export default function DashboardView() {
  const vscode = useVSCode();
  const [user, setUser] = useState<User | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [files, setFiles] = useState<ReviewFile[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [hasChanges, setHasChanges] = useState(true);
  const [reviewInProgress, setReviewInProgress] = useState(false);

  useEffect(() => {
    const cleanup = vscode.onMessage((message) => {
      console.log('DashboardView received message:', message.type, message);
      switch (message.type) {
        case 'userData':
          console.log('Setting user data:', message.user);
          setUser(message.user);
          break;
        case 'repositoriesData':
          console.log('Setting repositories:', message.repositories);
          setRepositories(message.repositories);
          break;
        case 'branchesData':
          console.log('Setting branches:', message.branches);
          setBranches(message.branches);
          break;
        case 'reviewFilesData':
          console.log('Setting review files:', message.files);
          setFiles(message.files);
          setFileCount(message.count);
          break;
        case 'reviewSessionUpdated':
          console.log('Review session updated:', message.session);
          // Replace with new session (only store one)
          setReviewSession(message.session);
          break;
        case 'changesStateUpdate':
          console.log('Changes state updated:', message.hasChanges);
          setHasChanges(message.hasChanges);
          break;
        case 'error':
          console.error('Error from extension:', message.message);
          break;
        case 'log':
          console.log('Extension Log:', message.message);
          break;
      }
    });

    return cleanup;
  }, [vscode]);

  const handleSettings = () => {
    vscode.postMessage({ type: 'openSettings' });
  };

  const handleLogout = () => {
    vscode.postMessage({ type: 'logout' });
  };

  const handleFileClick = (filePath: string, line: number) => {
    console.log('Navigating to:', filePath, 'line:', line);
    vscode.postMessage({ 
      type: 'navigateToComment',
      filePath,
      line
    });
  };

  const handleToggleFile = (filePath: string) => {
    vscode.postMessage({
      type: 'toggleFile',
      filePath
    });
  };

  const handleStartReview = () => {
    setReviewInProgress(true);
    
    // Create optimistic session immediately (replaces old one)
    const optimisticSession: ReviewSession = {
      dataId: 'pending',
      title: 'Review in Progress',
      branch: {
        from: branches[0]?.name || 'current',
        to: 'base',
      },
      status: 'running',
      totalComments: 0,
      resolvedComments: 0,
      files: files.map(file => ({
        filePath: file.path,
        comments: [],
        criticalCount: 0,
        highCount: 0,
        issueCount: 0,
        expanded: false,
      })),
      createdAt: new Date(),
    };
    
    // Set as the only session
    setReviewSession(optimisticSession);
    
    vscode.postMessage({ type: 'triggerReview' });
  };

  const handleStopReview = () => {
    setReviewInProgress(false);
    // Clear the session
    setReviewSession(null);
  };

  return (
    <div className="p-4">
      {/* <Header onSettings={handleSettings} /> */}
      <AccountSection user={user} onLogout={handleLogout} />
      <BranchSection branch={branches[0] || null} />
      <FilesSection 
        files={reviewInProgress ? [] : files} 
        fileCount={fileCount} 
        disabled={!hasChanges}
        reviewInProgress={reviewInProgress}
        onStartReview={handleStartReview}
        onStopReview={handleStopReview}
      />
      {reviewSession && (
        <ReviewSessionsList 
          session={reviewSession}
          onFileClick={handleFileClick}
          onToggleFile={handleToggleFile}
        />
      )}
      {/* {user?.subscriptionStatus === 'free' && <UpgradeSection />} */}
    </div>
  );
}
