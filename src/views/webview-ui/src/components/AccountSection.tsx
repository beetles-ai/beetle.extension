import type { User } from '../types';
import { useVSCode } from '../hooks/useVSCode';

interface AccountSectionProps {
  user: User | null;
}

export default function AccountSection({ user }: AccountSectionProps) {
  const vscode = useVSCode();
  console.log(user, "here is teh user");

  const handleLogout = () => {
    vscode.postMessage({ type: 'logout' });
  };

  return (
    <div className="mb-5 pb-4 border-b border-vscode-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase opacity-60 tracking-wider">
          ACCOUNT
        </div>
        {user && (
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded border bg-[#1e1e1e] text-[#4a9eff] border-[#4a9eff]">
            {user.planType || 'FREE'}
          </span>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {user ? (user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.username) : 'Loading...'}
          </span>
          {user && user.email && (
            <span className="text-xs opacity-60 truncate max-w-[200px]">
              {user.email}
            </span>
          )}
        </div>
        
        <button 
          onClick={handleLogout}
          className="p-1.5 hover:bg-vscode-button-hover rounded opacity-60 hover:opacity-100 transition-all"
          title="Logout"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12 10V8H7V6h5V4l3 3-3 3zm-1-1v4H6v3l-5-1V1h5v3h2V1a1 1 0 0 0-1-1H1a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3h-1z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
