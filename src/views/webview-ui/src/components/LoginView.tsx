import { useVSCode } from '../hooks/useVSCode';

export default function LoginView() {
  const vscode = useVSCode();

  const handleLogin = () => {
    vscode.postMessage({ type: 'login' });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      {/* Logo */}
      <div className="w-20 h-20 mb-5 flex items-center justify-center rounded-xl bg-black p-2">
        <img src="beetle.png" alt="Beetle" className="w-full h-full object-contain" />
      </div>

      {/* Title */}
      <h1 className="text-xl font-semibold mb-3">Welcome to Beetle AI</h1>
      <p className="text-sm opacity-80 mb-6 max-w-xs leading-relaxed">
        AI Code Reviewer That Thinks Like Humans
      </p>

      {/* Features */}
      <div className="text-left mb-6 space-y-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5">🐛</span>
          <span className="text-sm opacity-90">Catch the bugs and security issues ai</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5">🎯</span>
          <span className="text-sm opacity-90">Get actionable code suggestions</span>
        </div>
      </div>

      {/* Login Button */}
      <button
        onClick={handleLogin}
        className="w-full max-w-[280px] px-5 py-2.5 bg-beetle-primary hover:bg-beetle-primary-hover text-white rounded font-medium text-sm transition-all active:scale-[0.98]"
      >
        Start for free
      </button>

      {/* Manual Login Link */}
      <div className="mt-4 text-xs opacity-70">
        Didn't get redirected?{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="text-beetle-primary hover:underline"
        >
          Click here to open the login page
        </a>
      </div>
    </div>
  );
}
