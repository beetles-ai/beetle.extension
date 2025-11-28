# Beetle VS Code Extension

**AI Code Reviewer That Thinks Like Humans**

## Overview

Beetle is a VS Code extension that brings AI-powered code review directly into your IDE. Get instant feedback on your code with full codebase context, catch bugs, and receive actionable suggestions.

## Features

- 🔐 **Secure Authentication** - OAuth flow with Beetle account
- 🪲 **AI Code Review** - Smart analysis with human-like insights
- 📊 **Repository Integration** - Connect your GitHub repositories
- 🎯 **Context-Aware** - Full codebase understanding
- ⚡ **Real-time Feedback** - Instant code suggestions

## Installation

1. Install the extension from the VS Code Marketplace (coming soon)
2. Or run locally for development:
   ```bash
   # Install dependencies
   pnpm install
   
   # Or if you have axios already added
   npm install axios
   
   # Compile the extension
   pnpm run compile
   
   # Press F5 to launch Extension Development Host
   ```

## Usage

### Step 1: Open Beetle Sidebar
Click the Beetle 🪲 icon in the Activity Bar (left sidebar).

### Step 2: Sign In
1. Click "Logging in..." button
2. Your browser will open to `https://beetleai.dev/signin`
3. Complete authentication in the browser
4. You'll be redirected back to VS Code automatically

### Step 3: Select Repository & Branch
- Choose your repository from the dropdown
- Select the branch you want to review
- View files pending review

### Step 4: Trigger Review
Click "Review all changes" to start the AI code review process.

## Authentication Flow

The extension uses OAuth with a custom URI handler:

1. **User clicks login** → Opens browser to Beetle signin page
2. **User authenticates** → Logs in on beetleai.dev
3. **Backend redirects** → `vscode://beetle.beetle/auth-callback?token=<ACCESS_TOKEN>`
4. **Extension receives token** → Stored securely in VS Code SecretStorage
5. **UI updates** → Shows logged-in dashboard

## Project Structure

```
beetle.extension/
├── src/
│   ├── authentication/          # OAuth and token management
│   │   ├── AuthenticationProvider.ts
│   │   └── types.ts
│   ├── services/                # API integration
│   │   ├── ApiClient.ts
│   │   └── BeetleService.ts
│   ├── views/                   # UI components
│   │   ├── BeetleViewProvider.ts
│   │   └── webview/
│   │       ├── login.html
│   │       ├── main.html
│   │       └── styles.css
│   ├── utils/                   # Utilities
│   │   ├── logger.ts
│   │   └── constants.ts
│   ├── types/                   # TypeScript definitions
│   │   └── index.ts
│   └── extension.ts             # Entry point
├── media/                       # Icons and assets
│   └── beetle-icon.svg
├── package.json
└── tsconfig.json
```

## Development

### Prerequisites
- Node.js 22.x or higher
- pnpm (or npm)
- VS Code 1.106.1 or higher

### Setup
```bash
# Clone the repository
cd beetle.extension

# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Watch mode (auto-recompile on changes)
pnpm run watch
```

### Testing Locally
1. Press `F5` in VS Code to launch Extension Development Host
2. The Beetle icon will appear in the Activity Bar
3. Click to open the sidebar panel
4. Test authentication flow (see below)

### Testing Authentication Without Backend
For development/testing without the full backend:

1. Open Command Palette (`Cmd+Shift+P`)
2. Run: `> Open URI...`
3. Enter: `vscode://beetle.beetle/auth-callback?token=test_token_123`
4. The extension will store the token and switch to logged-in UI

## API Integration

The extension expects the following API endpoints:

- `GET /api/user/me` - Get current user info
- `GET /api/repositories` - List user repositories  
- `GET /api/repositories/:id/branches` - Get branches for a repo
- `GET /api/reviews/pending` - Get files pending review
- `POST /api/reviews/trigger` - Trigger a code review

All requests include `Authorization: Bearer <token>` header.

## Configuration

Currently, the extension uses hardcoded values in `src/utils/constants.ts`:

```typescript
BEETLE_API_BASE_URL = 'https://beetleai.dev/api'
BEETLE_SIGNIN_URL = 'https://beetleai.dev/signin'
```

Future: These will be configurable via VS Code settings.

## Security

- Access tokens are stored in VS Code's **SecretStorage** (encrypted)
- All API requests use HTTPS
- OAuth callback uses custom URI scheme (`vscode://`)
- No sensitive data in logs or console

## Troubleshooting

### Extension not activating
- Check the Output panel (`View > Output > Beetle`)
- Look for activation errors

### Login redirect not working
- Ensure the backend redirects to: `vscode://beetle.beetle/auth-callback?token=<TOKEN>`
- Check URI handler is registered (should auto-register on activation)

### Sidebar not showing
- Click the Beetle icon in the Activity Bar (left side)
- If icon missing, check `media/beetle-icon.svg` exists

### API errors
- Check network connectivity
- Verify API base URL in constants
- Check Output panel for detailed error logs

## Contributing

This is an internal Beetle project. For issues or feature requests, contact the team.

## License

Proprietary - Beetle AI © 2024

---

**Built with ❤️ by the Beetle team**
