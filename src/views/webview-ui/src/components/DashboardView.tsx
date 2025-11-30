import { useState, useEffect } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import type { User, ReviewFile, Branch, ReviewSession } from '../types';
import AccountSection from './AccountSection';
import BranchSection from './BranchSection';
import FilesSection from './FilesSection';
import ReviewSessionsList from './ReviewSessionsList';

export default function DashboardView() {
  const vscode = useVSCode();
  const [user, setUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [files, setFiles] = useState<ReviewFile[]>([]);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(true);
  const [reviewInProgress, setReviewInProgress] = useState(false);

  const [isStarting, setIsStarting] = useState(false);

  console.log(sessions, "here are the sessions")
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
          break;
        case 'branchesData':
          console.log('Setting branches:', message.branches);
          setBranches(message.branches);
          break;
        case 'reviewFilesData':
          console.log('Setting review files:', message.files);
          setFiles(message.files);
          break;
        case 'reviewSessionsUpdated':
          console.log('Review sessions updated:', message.sessions, 'current:', message.currentSessionId);
          setSessions(message.sessions);
          setCurrentSessionId(message.currentSessionId);
          
          // If we have a current session, the review has officially started
          if (message.currentSessionId) {
            setReviewInProgress(true);
            setIsStarting(false);
          }

          // Auto-stop reviewInProgress if current session is complete
          const currentSession = message.sessions.find(s => s.dataId === message.currentSessionId);
          if (currentSession && (currentSession.status === 'completed' || currentSession.status === 'failed')) {
            setReviewInProgress(false);
          }
          break;
        case 'changesStateUpdate':
          console.log('Changes state updated:', message.hasChanges);
          setHasChanges(message.hasChanges);
          break;
        case 'error':
          console.error('Error from extension:', message.message);
          setIsStarting(false);
          break;
        case 'log':
          console.log('Extension Log:', message.message);
          break;
      }
    });

    return cleanup;
  }, [vscode]);

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

  const handleToggleFile = (filePath: string, sessionId?: string) => {
    vscode.postMessage({
      type: 'toggleFile',
      filePath,
      sessionId
    });
  };

  const handleClearSession = () => {
    // Clear current session (moves to previous)
    setCurrentSessionId(null);
    setReviewInProgress(false);
    
    // Notify extension to archive current session
    vscode.postMessage({ type: 'clearSession' });
  };

  const handleDeleteSession = (sessionId: string) => {
    // Remove specific session
    vscode.postMessage({ 
      type: 'deleteSession',
      sessionId 
    });
  };

  const handleStartReview = () => {
    setIsStarting(true);
    
    // Use filteredFiles (only incremental changes) for the session
    const filesToReview = filteredFiles;
    
    // Send only the filtered files to review
    vscode.postMessage({ 
      type: 'triggerReview',
      filePaths: filesToReview.map(f => f.path)
    });
  };

  const handleStopReview = () => {
    setReviewInProgress(false);
    // Clear current session (moves to previous)
    setCurrentSessionId(null);
  };

  // Progressive review: Detect incremental changes across ALL sessions
  const getFilesWithIncrementalChanges = (): ReviewFile[] => {
    if (sessions.length === 0) {
      // No sessions, show all files
      console.log('📝 No sessions - showing all', files.length, 'files');
      return files;
    }
    
    const filesWithNewChanges: ReviewFile[] = [];
    
    for (const currentFile of files) {
      // Check if file content matches ANY previous session's reviewed content
      let isNewChange = true;
      let lastReviewedHash: string | undefined;
      
      // Check all sessions to see if we've reviewed this exact content before
      for (const session of sessions) {
        const sessionFile = session.files.find(
          (sf: any) => sf.filePath === currentFile.path
        );
        
        if (sessionFile && sessionFile.lastReviewedHash) {
          lastReviewedHash = sessionFile.lastReviewedHash;
          const currentHash = currentFile.contentHash || '';
          
          if (currentHash && currentHash === lastReviewedHash) {
            // We found a session where we reviewed this EXACT content
            console.log(`✅ Found match in session ${session.dataId} for ${currentFile.path}`);
            isNewChange = false;
            break; // No need to check other sessions, we found a match
          }
        }
      }
      
      if (isNewChange) {
        console.log(`✨ New/Modified content for: ${currentFile.path}`);
        filesWithNewChanges.push(currentFile);
      }
    }
    
    console.log(`📊 Total: ${files.length} files, showing ${filesWithNewChanges.length} with changes`);
    return filesWithNewChanges;
  };

  const filteredFiles = getFilesWithIncrementalChanges();

  return (
    <div className="p-4">
      {/* <Header onSettings={handleSettings} /> */}
      <AccountSection user={user} onLogout={handleLogout} />
      <BranchSection branch={branches[0] || null} />
      <FilesSection 
        files={reviewInProgress ? [] : filteredFiles} 
        fileCount={filteredFiles.length} 
        disabled={!hasChanges || filteredFiles.length === 0}
        reviewInProgress={reviewInProgress}
        isStarting={isStarting}
        onStartReview={handleStartReview}
        onStopReview={handleStopReview}
      />
      {sessions.length > 0 && (
        <ReviewSessionsList 
          sessions={sessions}
          currentSessionId={currentSessionId}
          onFileClick={handleFileClick}
          onToggleFile={handleToggleFile}
          onClearSession={handleClearSession}
          onDeleteSession={handleDeleteSession}
        />
      )}
      {/* {user?.subscriptionStatus === 'free' && <UpgradeSection />} */}
    </div>
  );
}
