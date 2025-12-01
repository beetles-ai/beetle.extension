import { CommentData } from '../types';
import { Check, Sparkles } from 'lucide-react';

interface CommentPreviewProps {
  comment: CommentData;
  onClick: () => void;
}

export default function CommentPreview({ comment, onClick }: CommentPreviewProps) {

  const getSeverityBorderColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'border-red-500';
      case 'high':
        return 'border-orange-500';
      case 'medium':
        return 'border-yellow-500';
      case 'low':
        return 'border-blue-500';
      default:
        return 'border-gray-500';
    }
  };


  // Truncate content for preview
  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const handleMarkResolved = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Send message to extension to mark comment as resolved
    // @ts-ignore
    window.vscode?.postMessage({
      type: 'markCommentResolved',
      commentId: comment.id,
      filePath: comment.file_path,
      lineStart: comment.line_start
    });
  };

  const handleFixWithAI = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Extract the "Prompt for AI" section from comment content
    const promptMatch = comment.content.match(/\*\*Prompt for AI\*\*\s*([\s\S]*?)(?:\n\n##|\n\n\*\*|$)/);
    
    if (!promptMatch || !promptMatch[1]) {
      console.warn('No AI prompt found in comment');
      // @ts-ignore
      window.vscode?.postMessage({
        type: 'showWarning',
        message: 'No AI prompt found in comment'
      });
      return;
    }
    
    const aiPrompt = promptMatch[1].trim();
    
    // Send message to extension to copy to clipboard
    // @ts-ignore
    window.vscode?.postMessage({
      type: 'copyToClipboard',
      text: aiPrompt
    });
  };

  return (
    <div
      className={`group px-1 hover:bg-vscode-list-hover cursor-pointer transition-colors border-l-[3px] ${getSeverityBorderColor(comment.severity)} ${comment.resolved ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col items-start gap-1 m-1">
            <p className="text-[8px] opacity-50">
              Line {comment.line_start}
              {comment.line_end !== comment.line_start && `-${comment.line_end}`}
            </p>
            <p className={`text-xs leading-relaxed ${comment.resolved ? 'line-through' : ''}`}>
              {comment.resolved && '✓ '}
              {truncateContent(comment?.title ?? 'Issue')}
            </p>
          </div>
        </div>
        
        {/* Utility Icons - show on hover, hide if resolved */}
        {/* {!comment.resolved && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleFixWithAI}
              className="p-1 hover:bg-beetle-primary/20 rounded transition-colors"
              title="Fix with AI"
            >
              <Sparkles className="h-3 w-3 text-beetle-primary" />
            </button>
            <button
              onClick={handleMarkResolved}
              className="p-1 hover:bg-green-500/20 rounded transition-colors"
              title="Mark as resolved"
            >
              <Check className="h-3 w-3 text-green-500" />
            </button>
          </div>
        )} */}
      </div>
    </div>
  );
}
