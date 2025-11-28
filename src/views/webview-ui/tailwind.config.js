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
        'beetle-primary': '#0066ff',
        'beetle-primary-hover': '#0052cc',
        'beetle-gradient-start': '#667eea',
        'beetle-gradient-end': '#764ba2',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
