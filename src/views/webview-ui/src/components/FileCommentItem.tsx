import { FileCommentGroup } from '../types';
import CommentPreview from './CommentPreview';
import { ChevronDown, ChevronRight, File } from 'lucide-react';

interface FileCommentItemProps {
  file: FileCommentGroup;
  onCommentClick: (line: number) => void;
  onToggle: () => void;
  isActiveReview?: boolean;
}

export default function FileCommentItem({ 
  file, 
  onCommentClick, 
  onToggle,
  isActiveReview = false 
}: FileCommentItemProps) {
  const fileName = file.filePath.split('/').pop() || file.filePath;
  
  // Get badge text and color - shows all non-zero severity counts
  const getBadge = () => {
    // If it's an active review with no comments, show blinking yellow dot
    if (isActiveReview && file.comments.length === 0) {
      return {
        element: <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />,
      };
    }

    // Calculate counts for each severity
    const mediumCount = file.comments.filter(c => c.severity.toLowerCase() === 'medium').length;
    const lowCount = file.comments.filter(c => c.severity.toLowerCase() === 'low').length;
    
    const badges: { text: string; color: string }[] = [];
    
    if (file.criticalCount > 0) {
      badges.push({ text: `${file.criticalCount}!`, color: 'text-red-400' });
    }
    if (file.highCount > 0) {
      badges.push({ text: `${file.highCount}`, color: 'text-orange-400' });
    }
    if (mediumCount > 0) {
      badges.push({ text: `${mediumCount}`, color: 'text-yellow-400' });
    }
    if (lowCount > 0) {
      badges.push({ text: `${lowCount}`, color: 'text-blue-400' });
    }
    
    // If no comments at all, don't show anything
    if (badges.length === 0) {
      return { element: null };
    }
    
    // Return combined badge element showing all non-zero counts
    return {
      element: (
        <div className="flex items-center gap-0.5">
          {badges.map((b, i) => (
            <span key={i} className={`text-xs font-medium ${b.color}`}>
              {b.text}{i < badges.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      ),
    };
  };
  
  const badge = getBadge();
  
  return (
    <div className="mb-2">
      {/* File Header */}
      <div
        className="flex items-center justify-between py-1 px-2 hover:bg-vscode-list-hover rounded cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-text-primary">
            {file.expanded ? <ChevronDown className='h-3 w-3' /> : <ChevronRight className='h-3 w-3' />}
          </span>
          <span className="text-xs text-text-secondary"><File className='h-3 w-3'/></span>
          <span className="text-xs text-text-primary truncate" title={file.filePath}>{fileName}</span>
        </div>
        {badge.element && (
          <div className="ml-2 flex-shrink-0">{badge.element}</div>
        )}
      </div>
      
      {/* Comments List or "No comments yet" message */}
      {file.expanded && (
        <div className="ml-6 pl-3">
          {file.comments.length === 0 ? (
            <div className="text-xs text-text-secondary py-2 italic">
              {isActiveReview ? 'Analyzing... no comments yet' : 'No comments'}
            </div>
          ) : (
            file.comments.map((comment, index) => (
              <CommentPreview
                key={comment.id || index}
                comment={comment}
                onClick={() => onCommentClick(comment.line_start)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
