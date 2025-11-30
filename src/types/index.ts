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
  | { type: 'openFile'; file: ReviewFile }
  | { type: 'navigateToComment'; filePath: string; line: number }
  | { type: 'toggleFile'; sessionId: string; filePath: string }
  | { type: 'markCommentResolved'; commentId: string; filePath: string; lineStart: number }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'showWarning'; message: string }
  | { type: 'clearSession' }
  | { type: 'ready' };

export type ExtensionMessage =
  | { type: 'authStateChanged'; isAuthenticated: boolean }
  | { type: 'userData'; user: User | null }
  | { type: 'repositoriesData'; repositories: Repository[] }
  | { type: 'branchesData'; branches: Branch[] }
  | { type: 'reviewFilesData'; files: ReviewFile[]; count: number }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string }
  | { type: 'reviewSessionUpdated'; session: ReviewSession }
  | { type: 'changesStateUpdate'; hasChanges: boolean };

// Enhanced UI Types
export interface CommentData {
  id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  confidence: string;
  content: string;
  created_at: Date;
}

export interface FileCommentGroup {
  filePath: string;
  comments: CommentData[];
  criticalCount: number;
  highCount: number;
  issueCount: number; // Critical + High
  expanded: boolean;
}

export interface ReviewSession {
  dataId: string;
  title: string;
  branch: {
    from: string;
    to: string;
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalComments: number;
  resolvedComments: number;
  files: FileCommentGroup[];
  createdAt: Date;
}
