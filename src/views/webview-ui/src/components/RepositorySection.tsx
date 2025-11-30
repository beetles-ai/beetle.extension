import { useVSCode } from '../hooks/useVSCode';
import type { Repository } from '../types';

interface RepositorySectionProps {
  repository: Repository | null;
}

export default function RepositorySection({ repository }: RepositorySectionProps) {
  const vscode = useVSCode();

  const handleSelectRepo = () => {
    vscode.postMessage({ type: 'selectRepository' });
  };

  return (
    <div className="mb-5 pb-4 border-b border-vscode-border">
          <div className="text-xs text-white tracking-wider">
        Repository
      </div>
      <div
        onClick={handleSelectRepo}
        className="flex items-center justify-between w-full px-2 py-1.5 bg-vscode-input-bg border border-vscode-border rounded cursor-pointer hover:border-beetle-primary transition-colors"
      >
        <span className="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis">
          {repository ? repository.name : 'Select repository...'}
        </span>
        <span className="opacity-50 text-sm ml-2">✏️</span>
      </div>
    </div>
  );
}
