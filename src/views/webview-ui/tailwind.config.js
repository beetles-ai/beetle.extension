/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VS Code theme colors - adapts to light/dark theme automatically
        'vscode-bg': 'var(--vscode-sideBar-background)',
        'vscode-fg': 'var(--vscode-sideBar-foreground)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-button-bg': 'var(--vscode-button-background)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-list-hover': 'var(--vscode-list-hoverBackground)',
        
        // Primary colors - using VS Code button colors (blue)
        'beetle-primary': 'var(--vscode-button-background)',
        'beetle-primary-dark': 'var(--vscode-button-hoverBackground)',
        'beetle-primary-hover': 'var(--vscode-button-hoverBackground)',
        'beetle-primary-fg': 'var(--vscode-button-foreground)',
        
        // Theme-adaptive colors using VS Code variables
        'background': 'var(--vscode-sideBar-background)',
        'foreground': 'var(--vscode-sideBar-foreground)',
        'card': 'var(--vscode-editor-background)',
        'card-foreground': 'var(--vscode-editor-foreground)',
        'muted': 'var(--vscode-input-background)',
        'muted-foreground': 'var(--vscode-descriptionForeground)',
        'accent': 'var(--vscode-focusBorder)',
        'destructive': 'var(--vscode-errorForeground)',
        'border': 'var(--vscode-panel-border)',
        
        // Text colors
        'text-primary': 'var(--vscode-foreground)',
        'text-secondary': 'var(--vscode-descriptionForeground)',
        'text-muted': 'var(--vscode-disabledForeground)',
        'text-link': 'var(--vscode-textLink-foreground)',
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
