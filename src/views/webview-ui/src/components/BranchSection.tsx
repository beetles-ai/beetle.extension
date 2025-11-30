import { useState } from 'react';
import { Branch } from '../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface BranchSectionProps {
  branch: Branch | null;
}

export default function BranchSection({ branch }: BranchSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="mb-4">
      <div 
        className="flex items-center gap-2 cursor-pointer py-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-xs ">{isExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}</span>
          <span className="text-xs text-white tracking-wider">
          Branch
        </span>
      </div>

      {isExpanded && branch && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-vscode-input-bg rounded text-xs">
              <span>🔧</span>
              <span>{branch.name}</span>
            </div>
            <span className="opacity-60">←</span>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-vscode-input-bg rounded text-xs">
              <span>🔧</span>
              <span>main</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
