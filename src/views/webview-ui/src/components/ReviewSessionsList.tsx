import { useState } from 'react';
import { ReviewSession } from '../types';
import ReviewSessionItem from './ReviewSessionItem';
import { ScanSearch, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

interface ReviewSessionsListProps {
  sessions: ReviewSession[];
  currentSessionId: string | null;
  onFileClick: (filePath: string, line: number) => void;
  onToggleFile: (filePath: string, sessionId?: string) => void;
  onClearSession: () => void;
  onDeleteSession: (sessionId: string) => void; // Delete specific session
}

export default function ReviewSessionsList({
  sessions,
  currentSessionId,
  onFileClick,
  onToggleFile,
  onClearSession,
  onDeleteSession
}: ReviewSessionsListProps) {
  const [previousExpanded, setPreviousExpanded] = useState(false);

  const currentSession = sessions.find(s => s.dataId === currentSessionId);
  const previousSessions = sessions.filter(s => s.dataId !== currentSessionId);

  return (
    <div className="mt-4">
      {/* Current Review Section */}
      {currentSession && (
        <>
          <div className="text-xs font-semibold mb-3 tracking-wider flex items-center justify-between">
            <div className="flex items-center gap-1">
              <ScanSearch className='h-3 w-3 inline-block' /> REVIEW
            </div>
            <button
              onClick={onClearSession}
              className="p-1 hover:bg-vscode-list-hover rounded transition-colors"
              title="Clear session"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          <ReviewSessionItem
            session={currentSession}
            onFileClick={onFileClick}
            onToggleFile={onToggleFile}
            onDelete={() => onDeleteSession(currentSession.dataId)}
            showDelete={true}
          />
        </>
      )}

      {/* Previous Reviews Section */}
      {previousSessions.length > 0 && (
        <div className="mt-4">
          <div 
            className="flex items-center gap-2 cursor-pointer py-1 text-xs font-semibold tracking-wider"
            onClick={() => setPreviousExpanded(!previousExpanded)}
          >
            <span>{previousExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}</span>
            <span className='font-semibold'>PREVIOUS REVIEWS</span>
            <span className="ml-1 px-1.5 py-0.5 bg-vscode-input-bg rounded text-[10px]">
              {previousSessions.length}
            </span>
          </div>

          {previousExpanded && (
            <div className="space-y-1 mt-2">
              {previousSessions.map(session => (
                <ReviewSessionItem
                  key={session.dataId}
                  session={session}
                  onFileClick={onFileClick}
                  onToggleFile={onToggleFile}
                  onDelete={() => onDeleteSession(session.dataId)}
                  showDelete={true}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
