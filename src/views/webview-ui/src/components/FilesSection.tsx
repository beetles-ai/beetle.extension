import { useVSCode } from '../hooks/useVSCode';
import type { ReviewFile } from '../types';

interface FilesSectionProps {
  files: ReviewFile[];
  fileCount: number;
}

export default function FilesSection({ files, fileCount }: FilesSectionProps) {
  const vscode = useVSCode();

  const handleReview = () => {
    vscode.postMessage({ type: 'triggerReview' });
  };

  return (
    <div className="mb-5 pb-4 border-b border-vscode-border">
      <div className="text-[11px] font-semibold uppercase opacity-60 mb-3 tracking-wider">
        FILES TO REVIEW ({fileCount})
      </div>

      {/* Files List */}
      <div className="my-3 min-h-[60px] flex items-center justify-center">
        {files.length === 0 ? (
          <div className="opacity-50 text-sm text-center">No files to review</div>
        ) : (
          <div className="w-full space-y-1">
            {files.map((file, index) => (
              <div
                key={index}
                className="px-2 py-2 bg-vscode-input-bg rounded text-xs flex items-center gap-2"
              >
                <span className="flex-1">{file.path}</span>
                <span className="text-[10px] opacity-60">{file.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Button */}
      <button
        onClick={handleReview}
        className="w-full px-5 py-2.5 mt-3 bg-beetle-primary hover:bg-beetle-primary-hover text-white rounded font-medium text-sm transition-all active:scale-[0.98]"
      >
        Review all changes
      </button>
    </div>
  );
}
