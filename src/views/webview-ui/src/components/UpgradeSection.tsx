import { useVSCode } from '../hooks/useVSCode';

export default function UpgradeSection() {
  const vscode = useVSCode();

  const handleUpgrade = () => {
    vscode.postMessage({ type: 'openUpgrade' });
  };

  return (
    <div className="mt-5 p-3 rounded-md bg-gradient-to-br from-[rgba(102,126,234,0.1)] to-[rgba(118,75,162,0.1)] border border-[rgba(102,126,234,0.3)]">
      <div className="flex items-center gap-1.5 text-sm font-semibold mb-2">
        <span>⚡</span>
        <span>Upgrade to PRO</span>
      </div>
      <div className="text-xs opacity-90 mb-3 leading-relaxed">
        • Higher rate limits<br />
        • Tool runs and checks<br />
        • Use coding guidelines<br />
        • Codebase verification<br />
        • Code Graph analysis
      </div>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          handleUpgrade();
        }}
        className="text-beetle-primary text-xs font-medium inline-flex items-center gap-1 hover:underline"
      >
        Learn more →
      </a>
    </div>
  );
}
