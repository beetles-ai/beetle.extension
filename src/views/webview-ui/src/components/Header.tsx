interface HeaderProps {
  onSettings: () => void;
}

export default function Header({ onSettings }: HeaderProps) {
  return (
    <div className="flex justify-between items-center mb-5">
      <h1 className="text-base font-semibold">Beetle</h1>
      <button
        onClick={onSettings}
        className="text-lg opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
        title="Settings"
      >
        ⚙️
      </button>
    </div>
  );
}
