import { useState } from 'react';
import { ReviewSession } from '../types';
import FileCommentItem from './FileCommentItem';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface ReviewSessionItemProps {
  session: ReviewSession;
  onFileClick: (filePath: string, line: number) => void;
  onToggleFile: (filePath: string, sessionId?: string) => void;
  onDelete?: () => void; // Optional delete handler
  showDelete?: boolean; // Whether to show delete button
  isActiveReview?: boolean;
}

export default function ReviewSessionItem({ 
  session, 
  onFileClick, 
  onToggleFile,
  onDelete,
  showDelete = false,
  isActiveReview = false
}: ReviewSessionItemProps) {
  const [expanded, setExpanded] = useState(false);
  
  const progress = session.totalComments > 0 
    ? (session.resolvedComments / session.totalComments) * 100 
    : 0;
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent expanding
    if (onDelete) {
      onDelete();
    }
  };
  
  return (
    <div className="mb-2 group">
      {/* Session Header */}
      <div 
        className="flex items-center justify-between cursor-pointer py-1 hover:opacity-80 transition-opacity"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-text-primary">{expanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}</span>
          <span className="font-medium text-xs text-text-primary">{session.title}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Loading animation for running status */}
          {session.status === 'running' && (
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 bg-beetle-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1 h-1 bg-beetle-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1 h-1 bg-beetle-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          )}
          
          {/* Delete button - only visible on hover */}
          {showDelete && onDelete && (
            <button
              onClick={handleDelete}
              className="p-1 text-text-primary hover:bg-vscode-list-hover rounded transition-all opacity-0 group-hover:opacity-100"
              title="Delete this review"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      
      {expanded && (
        <>
          {/* Progress Bar */}
          <div className="ml-3 mr-3 my-2 border-b border-vscode-input-bg">
            <div className="h-1.5 bg-vscode-input-bg rounded-full overflow-hidden">
              <div 
                className="h-full bg-beetle-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-text-secondary mt-2 mb-4">
              {session.resolvedComments} of {session.totalComments} issues resolved
            </div>
          </div>
          
          {/* Files List */}
          {session.files.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold mb-2 tracking-wide text-text-primary">
                Files ({session.files.length})
              </div>
              
              {session.files.map(file => (
                <FileCommentItem
                  key={file.filePath}
                  file={file}
                  onCommentClick={(line) => onFileClick(file.filePath, line)}
                  onToggle={() => onToggleFile(file.filePath, session.dataId)}
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
