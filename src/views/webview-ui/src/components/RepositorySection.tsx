import { useVSCode } from '../hooks/useVSCode';

export default function RepositorySection() {
  const vscode = useVSCode();

  const handleSelectRepo = () => {
    vscode.postMessage({ type: 'selectRepository' });
  };

  return (
    <div className="mb-5 pb-4 border-b border-vscode-border">
      <div className="text-[11px] font-semibold uppercase opacity-60 mb-2 tracking-wider">
        REPOSITORY
      </div>
      <div
        onClick={handleSelectRepo}
        className="flex items-center justify-between w-full px-2 py-1.5 bg-vscode-input-bg border border-vscode-border rounded cursor-pointer hover:border-beetle-primary transition-colors"
      >
        <span className="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis">
          Select repository...
        </span>
        <span className="opacity-50 text-sm ml-2">✏️</span>
      </div>
    </div>
  );
}
