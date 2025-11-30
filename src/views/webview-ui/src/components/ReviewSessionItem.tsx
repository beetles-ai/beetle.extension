import { useState } from 'react';
import { ReviewSession } from '../types';
import FileCommentItem from './FileCommentItem';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ReviewSessionItemProps {
  session: ReviewSession;
  onFileClick: (filePath: string, line: number) => void;
  onToggleFile: (filePath: string) => void;
  isActiveReview?: boolean;
}

export default function ReviewSessionItem({ 
  session, 
  onFileClick, 
  onToggleFile,
  isActiveReview = false
}: ReviewSessionItemProps) {
  const [expanded, setExpanded] = useState(true);
  
  const progress = session.totalComments > 0 
    ? (session.resolvedComments / session.totalComments) * 100 
    : 0;
  
  return (
    <div className="mb-4 pl-3">
      {/* Session Header */}
      <div 
        className="flex items-center justify-between cursor-pointer py-1 hover:opacity-80 transition-opacity"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1">
        <span className="text-xs ">{expanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}</span>
          <span className="font-medium text-sm">{session.title}</span>
        </div>
        {session.status === 'running' && (
          <span className="text-xs text-beetle-primary animate-pulse">●</span>
        )}
      </div>
      
      {expanded && (
        <>
          {/* Progress Bar */}
          <div className="my-2">
            <div className="h-1.5 bg-vscode-input-bg rounded-full overflow-hidden">
              <div 
                className="h-full bg-beetle-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs opacity-60 mt-1.5">
              {session.resolvedComments} of {session.totalComments} issues resolved
            </div>
          </div>
          
          {/* Files List */}
          {session.files.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase opacity-50 mb-2 tracking-wide">
                FILES ({session.files.length})
              </div>
              
              {session.files.map(file => (
                <FileCommentItem
                  key={file.filePath}
                  file={file}
                  onCommentClick={(line) => onFileClick(file.filePath, line)}
                  onToggle={() => onToggleFile(file.filePath)}
                  isActiveReview={isActiveReview}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
