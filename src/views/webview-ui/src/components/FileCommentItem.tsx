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
  
  // Get badge text and color
  const getBadge = () => {
    // If it's an active review with no comments, show blinking yellow dot
    if (isActiveReview && file.comments.length === 0) {
      return {
        element: <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />,
        color: 'text-yellow-400'
      };
    }

    if (file.criticalCount > 0) {
      return {
        text: file.criticalCount >= 5 ? '5+' : `${file.criticalCount}!`,
        color: 'text-red-400'
      };
    }
    if (file.highCount > 0) {
      return {
        text: file.highCount >= 5 ? '5+' : `${file.highCount}!`,
        color: 'text-orange-400'
      };
    }
    return {
      text: file.comments.length >= 5 ? '5+' : file.comments.length.toString(),
      color: 'text-yellow-400'
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
          <span className="text-xs ">
            {file.expanded ? <ChevronDown className='h-3 w-3' /> : <ChevronRight className='h-3 w-3' />}
          </span>
          <span className="text-xs"><File className='h-3 w-3'/></span>
          <span className="text-xs truncate" title={file.filePath}>{fileName}</span>
        </div>
        {badge.element ? (
          <div className="ml-2 flex-shrink-0">{badge.element}</div>
        ) : (
          <span className={`text-xs ${badge.color} ml-2 flex-shrink-0`}>
            {badge.text}
          </span>
        )}
      </div>
      
      {/* Comments List or "No comments yet" message */}
      {file.expanded && (
        <div className="ml-6 pl-3">
          {file.comments.length === 0 ? (
            <div className="text-xs opacity-50 py-2 italic">
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
