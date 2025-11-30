import { ReviewSession } from '../types';
import ReviewSessionItem from './ReviewSessionItem';
import { ScanSearch, Trash2 } from 'lucide-react';

interface ReviewSessionsListProps {
  session: ReviewSession;
  onFileClick: (filePath: string, line: number) => void;
  onToggleFile: (filePath: string) => void;
  onClearSession: () => void;
}

export default function ReviewSessionsList({
  session,
  onFileClick,
  onToggleFile,
  onClearSession
}: ReviewSessionsListProps) {
  console.log(session, "here is the session");

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold mb-3 tracking-wider flex items-center justify-between">
        <div className="flex items-center gap-1">
          <ScanSearch className='h-3 w-3 inline-block' /> Review
        </div>
        <button
          onClick={onClearSession}
          className="p-1 hover:bg-vscode-list-hover rounded transition-colors"
          title="Clear session"
        >
          <Trash2 className="h-3 w-3 text-red-400" />
        </button>
      </div>

      <ReviewSessionItem
        session={session}
        onFileClick={onFileClick}
        onToggleFile={onToggleFile}
        isActiveReview={session.status === 'running'}
      />
    </div>
  );
}
