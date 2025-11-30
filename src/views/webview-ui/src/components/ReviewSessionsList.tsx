import { ReviewSession } from '../types';
import ReviewSessionItem from './ReviewSessionItem';

interface ReviewSessionsListProps {
  session: ReviewSession;
  onFileClick: (filePath: string, line: number) => void;
  onToggleFile: (filePath: string) => void;
}

export default function ReviewSessionsList({
  session,
  onFileClick,
  onToggleFile
}: ReviewSessionsListProps) {
  console.log(session, "here is the session");

  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase opacity-60 mb-3 tracking-wider">
        📋 REVIEW
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
