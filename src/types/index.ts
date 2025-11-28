// Type definitions for Beetle extension

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  planType: 'FREE' | 'PRO' | 'ENTERPRISE';
}

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  url: string;
}

export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface ReviewFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export interface AuthToken {
  accessToken: string;
  expiresAt?: number;
}

// Webview → Extension messages
export type WebviewMessage =
  | { type: 'login' }
  | { type: 'logout' }
  | { type: 'selectRepository'; repoId: string }
  | { type: 'selectBranch'; branchName: string }
  | { type: 'triggerReview' }
  | { type: 'openSettings' }
  | { type: 'openUpgrade' }
  | { type: 'ready' };

export type ExtensionMessage =
  | { type: 'authStateChanged'; isAuthenticated: boolean }
  | { type: 'userData'; user: User | null }
  | { type: 'repositoriesData'; repositories: Repository[] }
  | { type: 'branchesData'; branches: Branch[] }
  | { type: 'reviewFilesData'; files: ReviewFile[]; count: number }
  | { type: 'error'; message: string };
