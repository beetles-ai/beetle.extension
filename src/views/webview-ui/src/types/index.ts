// Message types for communication between webview and extension

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subscriptionStatus: 'free' | 'active';
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
  patch?: string; // Full diff patch
  contentHash?: string; // Hash to detect changes
  isIncremental?: boolean; // File has new changes since last review
  previouslyReviewed?: boolean; // File was reviewed before
}

export type WebviewMessage =
  | { type: 'login' }
  | { type: 'logout' }
  | { type: 'selectRepository'; repoId?: string }
  | { type: 'selectBranch'; branchName?: string }
  | { type: 'triggerReview'; filePaths?: string[] } // Optional: specific files to review
  | { type: 'openSettings' }
  | { type: 'openUpgrade' }
  | { type: 'openFile'; file: ReviewFile }
  | { type: 'navigateToComment'; filePath: string; line: number }
  | { type: 'toggleFile'; filePath: string; sessionId?: string }
  | { type: 'markCommentResolved'; commentId: string; filePath: string; lineStart: number }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'showWarning'; message: string }
  | { type: 'clearSession' }
  | { type: 'deleteSession'; sessionId: string } // Delete specific session
  | { type: 'stopReview'; sessionId: string } // Stop running review
  | { type: 'ready' };

// Extension → Webview messages
export type ExtensionMessage =
  | { type: 'authStateChanged'; isAuthenticated: boolean }
  | { type: 'userData'; user: User | null }
  | { type: 'repositoriesData'; repositories: Repository[] }
  | { type: 'branchesData'; branches: Branch[] }
  | { type: 'reviewFilesData'; files: ReviewFile[]; count: number }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string }
  | { type: 'reviewSessionsUpdated'; sessions: ReviewSession[]; currentSessionId: string | null }
  | { type: 'changesStateUpdate'; hasChanges: boolean };

// Enhanced UI Types
export interface CommentData {
  id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  title: string;
  confidence: string;
  content: string;
  created_at: Date;
  resolved?: boolean;
}

export interface FileCommentGroup {
  filePath: string;
  comments: CommentData[];
  criticalCount: number;
  highCount: number;
  issueCount: number;
  expanded: boolean;
  // Progressive review tracking
  lastReviewedHash?: string; // Hash of file content when last reviewed
  lastReviewedPatch?: string; // Patch that was reviewed
  reviewedAt?: Date; // When this was reviewed
}

export interface ReviewSession {
  dataId: string;
  title: string;
  branch: {
    from: string;
    to: string;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  totalComments: number;
  resolvedComments: number;
  files: FileCommentGroup[];
  createdAt: Date;
}
