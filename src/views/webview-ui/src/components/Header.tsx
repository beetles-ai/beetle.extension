interface HeaderProps {
  onSettings: () => void;
}

export default function Header({ onSettings }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-vscode-border">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-beetle-primary flex items-center justify-center text-sm font-bold">
          B
        </div>
        <h1 className="text-lg font-semibold">Beetle</h1>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onSettings}
          className="p-1.5 hover:bg-vscode-list-hover rounded transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 1v6m0 6v6m0-18a9 9 0 0 1 9 9m-9-9a9 9 0 0 0-9 9m18 0a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9 9"></path>
            <path d="M12 7V1m0 18v-6m0-6h6m-6 0H6m12 0a3 3 0 0 1-3 3m3-3a3 3 0 0 0-3-3m-6 3a3 3 0 0 0 3 3m-3-3a3 3 0 0 1 3-3"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}
