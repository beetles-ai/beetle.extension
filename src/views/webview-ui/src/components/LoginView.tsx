import { useVSCode } from '../hooks/useVSCode';
import { Bug, ScanEye } from 'lucide-react';

export default function LoginView() {
  const vscode = useVSCode();
  // @ts-ignore - beetleImageUri is injected by webview
  const beetleImageUri = (window as any).beetleImageUri || '/beetle.png';

  const handleLogin = () => {
    vscode.postMessage({ type: 'login' });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center text-text-primary">
      {/* Logo */}
      <div className="w-20 h-20 mb-5 flex items-center justify-center rounded-xl bg-black p-2">
        <img src={beetleImageUri} alt="Beetle" className="w-full h-full object-contain" />
      </div>

      {/* Title */}
      <h1 className="text-xl font-semibold mb-3 text-text-primary">Welcome to Beetle</h1>
      <p className="text-sm font-semibold text-text-secondary mb-6 max-w-xs leading-relaxed">
        AI Code Reviewer That Thinks Like Humans
      </p>

      {/* Features */}
      <div className="text-left mb-6 space-y-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-text-secondary"><ScanEye className='h-3 w-3'/></span>
          <span className="text-sm text-text-secondary">Review your code changes before you push</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-text-secondary"><Bug className='h-3 w-3'/></span>
          <span className="text-sm text-text-secondary">Catch the bugs and security issues</span>
        </div>
      </div>

      {/* Login Button */}
      <button
        onClick={handleLogin}
        className="w-full max-w-[300px] px-5 py-2 bg-beetle-primary hover:bg-beetle-primary-hover text-beetle-primary-fg rounded font-medium text-sm transition-all active:scale-[0.98]"
      >
        Start for free
      </button>

      {/* Manual Login Link */}
      <div className="mt-4 text-xs text-text-secondary">
        Didn't get redirected?{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="text-text-link underline"
        >
          Click here
        </a>
      </div>

      {/* Footer */}
      <div className="mt-8 text-xs text-text-muted space-y-1">
        <div>
          See our security practices{' '}
          <a
            href="https://beetleai.dev/security"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-link underline"
          >
            here!
          </a>
        </div>
        <div>
          Have a question or issue? Write to us at{' '}
          <a
            href="mailto:shivang@beetleai.dev"
            className="text-text-link underline"
          >
            shivang@beetleai.dev
          </a>
        </div>
      </div>
    </div>
  );
}
