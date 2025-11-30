import { CommentData } from '../types';

interface CommentPreviewProps {
  comment: CommentData;
  onClick: () => void;
}

export default function CommentPreview({ comment, onClick }: CommentPreviewProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'text-red-400';
      case 'high':
        return 'text-orange-400';
      case 'medium':
        return 'text-yellow-400';
      case 'low':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🔵';
      default:
        return '⚪';
    }
  };

  // Truncate content for preview
  const truncateContent = (content: string, maxLength: number = 10) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div
      className="py-2 px-2 mb-1 hover:bg-vscode-list-hover rounded cursor-pointer transition-colors hover:border-beetle-primary"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs flex-shrink-0 ">
          {getSeverityBadge(comment.severity)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] ${getSeverityColor(comment.severity)}`}>
              {comment.severity}
            </span>
            <span className="text-[10px] opacity-50">
              Line {comment.line_start}
              {comment.line_end !== comment.line_start && `-${comment.line_end}`}
            </span>
          </div>
          <p className="text-xs opacity-80 leading-relaxed">
            {truncateContent(comment.content)}
          </p>
        </div>
      </div>
    </div>
  );
}
