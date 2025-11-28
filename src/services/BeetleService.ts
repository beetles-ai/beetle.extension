import { ApiClient } from './ApiClient';
import { Logger } from '../utils/logger';
import { User, Repository, Branch, ReviewFile } from '../types';

export class BeetleService {
  private apiClient: ApiClient;
  private logger: Logger;

  constructor(apiClient: ApiClient, logger: Logger) {
    this.apiClient = apiClient;
    this.logger = logger;
  }

  /**
   * Get current user information
   */
  public async getUserInfo(): Promise<User | null> {
    try {
      this.logger.info('Fetching user info');
      const user = await this.apiClient.get<any>('/user');
      return user.user;
    } catch (error) {
      this.logger.error('Failed to fetch user info', error);
      return null;
    }
  }

  /**
   * Get list of user's repositories
   */
  public async getRepositories(): Promise<Repository[]> {
    try {
      this.logger.info('Fetching repositories');
      // TODO: Update endpoint when API is ready
      const repos = await this.apiClient.get<Repository[]>('/repositories');
      return repos;
    } catch (error) {
      this.logger.error('Failed to fetch repositories', error);
      return [];
    }
  }

  /**
   * Get branches for a specific repository
   */
  public async getBranches(repoId: string): Promise<Branch[]> {
    try {
      this.logger.info('Fetching branches for repo', repoId);
      // TODO: Update endpoint when API is ready
      const branches = await this.apiClient.get<Branch[]>(`/repositories/${repoId}/branches`);
      return branches;
    } catch (error) {
      this.logger.error('Failed to fetch branches', error);
      return [];
    }
  }

  /**
   * Get files pending review for a repository/branch
   */
  public async getFilesToReview(repoId: string, branch: string): Promise<ReviewFile[]> {
    try {
      this.logger.info('Fetching files to review', { repoId, branch });
      // TODO: Update endpoint when API is ready
      const files = await this.apiClient.get<ReviewFile[]>(`/reviews/pending`, {
        params: { repoId, branch }
      });
      return files;
    } catch (error) {
      this.logger.error('Failed to fetch files to review', error);
      return [];
    }
  }

  /**
   * Trigger a code review for all changes
   */
  public async triggerReview(repoId: string, branch: string): Promise<boolean> {
    try {
      this.logger.info('Triggering review', { repoId, branch });
      // TODO: Update endpoint when API is ready
      await this.apiClient.post('/reviews/trigger', { repoId, branch });
      return true;
    } catch (error) {
      this.logger.error('Failed to trigger review', error);
      return false;
    }
  }
}
