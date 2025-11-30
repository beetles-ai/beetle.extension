import { useState } from 'react';
import { useVSCode } from '../hooks/useVSCode';
import type { ReviewFile } from '../types';
import { File, ChevronRight, ChevronDown } from 'lucide-react';

interface FilesSectionProps {
  files: ReviewFile[];
  fileCount: number;
  disabled?: boolean;
  reviewInProgress: boolean;
  onStartReview: () => void;
  onStopReview: () => void;
}

export default function FilesSection({ 
  files, 
  fileCount, 
  disabled = false,
  reviewInProgress,
  onStartReview,
  onStopReview
}: FilesSectionProps) {
  const vscode = useVSCode();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleReview = () => {
    if (disabled) return;
    setIsExpanded(false);
    onStartReview();
  };

  const handleStopReview = () => {
    onStopReview();
  };

  const handleFileClick = (file: ReviewFile) => {
    vscode.postMessage({ type: 'openFile', file });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'added':
        return 'text-green-500';
      case 'modified':
        return 'text-yellow-500';
      case 'deleted':
        return 'text-red-500';
      default:
        return 'text-blue-500';
    }
  };

  const getStatusLetter = (status: string) => {
    console.log(status, "here are ststus");
    switch (status.toLowerCase()) {
      case 'added':
        return 'A';
      case 'modified':
        return 'M';
      case 'deleted':
        return 'D';
      default:
        return 'M';
    }
  };

  return (
    <div className="mb-4">
      <div 
        className="flex items-center gap-2 cursor-pointer py-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-xs ">{isExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}</span>
          <span className="text-xs text-white tracking-wider">
          Files To Review ({fileCount})
        </span>
      </div>

      {isExpanded && (
        <>
          {/* Files List */}
          <div className="my-3 space-y-1">
            {files.length === 0 ? (
              <div className="opacity-50 text-sm text-center py-4">No files to review</div>
            ) : (
              files.map((file, index) => (
                <div
                  key={index}
                  onClick={() => handleFileClick(file)}
                  className="flex items-center justify-between p-1 hover:bg-vscode-list-hover cursor-pointer rounded transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs opacity-60"><File className='h-3 w-3'/></span>
                    <span className="text-xs truncate">{file.path}</span>
                  </div>
                  {reviewInProgress ? <></> :<span className={`text-xs ${getStatusColor(file.status)} ml-2 flex-shrink-0`}>
                    {getStatusLetter(file.status)}
                  </span>}
                </div>
              ))
            )}
          </div>
            </>
     )}
          {/* Review Button */}
          {reviewInProgress ? (
            <button
              onClick={handleStopReview}
              className="w-full mt-4 py-1 rounded transition-all font-medium text-sm bg-neutral-700 text-white cursor-pointer"
            >
              Stop Review
            </button>
          ) : (
            <button
              onClick={handleReview}
              disabled={disabled}
              className={`w-full mt-4 py-1 rounded transition-all font-medium text-sm ${
                disabled
                  ? 'bg-beetle-primary/30 text-white/50 cursor-not-allowed'
                  : 'bg-beetle-primary hover:bg-beetle-primary-dark text-black cursor-pointer'
              }`}
            >
              Review all changes
            </button>
          )}
      
 
    </div>
  );
}
