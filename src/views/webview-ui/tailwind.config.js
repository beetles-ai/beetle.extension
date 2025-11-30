/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VS Code theme colors - will be set via CSS variables
        'vscode-bg': 'var(--vscode-sideBar-background)',
        'vscode-fg': 'var(--vscode-sideBar-foreground)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-button-bg': 'var(--vscode-button-background)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-list-hover': 'var(--vscode-list-hoverBackground)',
        
        // Beetle colors matching web app
        'beetle-primary': '#00D4AA',  // oklch(0.7485 0.1215 168.88) - Main teal color
        'beetle-primary-dark': '#00B895',  // Darker shade for hover
        'beetle-primary-light': '#00F5C4',  // Lighter shade
        
        // Additional theme colors from web app
        'background': 'var(--background, #ffffff)',
        'foreground': 'var(--foreground, #000000)',
        'card': 'var(--card, #ffffff)',
        'card-foreground': 'var(--card-foreground, #000000)',
        'muted': 'var(--muted, #f7f7f7)',
        'muted-foreground': 'var(--muted-foreground, #737373)',
        'accent': 'var(--accent, #f0f0f0)',
        'destructive': 'var(--destructive, #ef4444)',
        'border': 'var(--border, #e5e5e5)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      borderRadius: {
        'lg': '0.4rem',
        'md': '0.3rem',
        'sm': '0.2rem',
      },
    },
  },
  plugins: [],
}
