export interface AuthToken {
  accessToken: string;
  expiresAt?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  token?: string;
}
