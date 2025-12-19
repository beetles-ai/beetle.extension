import { useState } from 'react';
import { User } from '../types';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';

interface AccountSectionProps {
  user: User | null;
  onLogout: () => void;
}

export default function AccountSection({ user, onLogout }: AccountSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);


  return (
    <div className="mb-4">
      <div 
        className="flex items-center justify-between cursor-pointer py-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-primary ">{isExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}</span>
          <span className="text-xs text-text-primary tracking-wider">
            Account
          </span>
          <span className="px-2 py-0.5 text-[10px] text-text-secondary border border-vscode-border rounded">
            {user?.subscriptionStatus || 'Free'}
          </span>
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLogout();
          }}
          className="text-xs text-text-primary"
        >
          <LogOut className='h-3 w-3' />
        </button>
      </div>

      {user &&isExpanded && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-beetle-primary/20 flex items-center justify-center text-lg">
              {user.firstName?.[0] || user.email[0].toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-text-primary">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user.username || user.email
                }
              </div>
              <div className="text-xs text-text-secondary">{user.email}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
