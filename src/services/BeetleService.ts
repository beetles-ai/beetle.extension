import { ApiClient } from './ApiClient';
import { Logger } from '../utils/logger';
import { User, Repository, Branch, ReviewFile } from '../types';

export class BeetleService {
  private apiClient: ApiClient;
  private logger: Logger;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(apiClient: ApiClient, logger: Logger) {
    this.apiClient = apiClient;
    this.logger = logger;
  }

  /**
   * Get current user information
   */
  public async getUserInfo(): Promise<User | null> {
    this.logger.info('Fetching user info');
    const response = await this.apiClient.get<any>('/user');
    return response.user;
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
   * Uses selective field compression for large patches/content
   */
  public async triggerReview(data: any): Promise<{ dataId: string; comments: any[] } | null> {
    try {
      this.logger.info('Triggering review', { repo: data.repository.name });
      
      // Compress large fields in each file change
      // Note: data.changes is an object with { summary, commits, files, fullDiff }
      const compressedData = {
        ...data,
        changes: {
          ...data.changes,
          files: data.changes.files.map((change: any) => this.compressChangeFields(change))
        }
      };
      
      this.logger.info('Sending request to API...');
      const response = await this.apiClient.post<any>('/extension/review', compressedData);
      
      this.logger.info('Received response from API', { 
        hasDataId: !!response.extension_data_id,
        dataId: response.extension_data_id 
      });
      
      return {
        dataId: response.extension_data_id,
        comments: response.comments || []
      };
    } catch (error: any) {
      this.logger.error('Failed to trigger review', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      return null;
    }
  }

  /**
   * Compress large fields in a change object
   * Only compresses fields > 1KB to reduce payload size
   */
  private compressChangeFields(change: any): any {
    try {
      const { gzipSync } = require('zlib');
      const compressed: any = { ...change };
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;
      
      // Compress patch if it exists and is large (> 1KB)
      if (change.patch && change.patch.length > 1024) {
        const originalSize = Buffer.byteLength(change.patch, 'utf-8');
        const gzipped = gzipSync(change.patch);
        compressed.patch_compressed = gzipped.toString('base64');
        delete compressed.patch;
        compressed._compressed = true;
        
        totalOriginalSize += originalSize;
        totalCompressedSize += gzipped.length;
      }
      
      // Compress content if it exists and is large (> 1KB)
      if (change.content && change.content.length > 1024) {
        const originalSize = Buffer.byteLength(change.content, 'utf-8');
        const gzipped = gzipSync(change.content);
        compressed.content_compressed = gzipped.toString('base64');
        delete compressed.content;
        compressed._compressed = true;
        
        totalOriginalSize += originalSize;
        totalCompressedSize += gzipped.length;
      }
      
      // Log compression metrics if anything was compressed
      if (compressed._compressed) {
        const ratio = ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(1);
        this.logger.info(`Compressed fields in ${change.filename}: ${(totalOriginalSize / 1024).toFixed(1)}KB → ${(totalCompressedSize / 1024).toFixed(1)}KB (${ratio}% reduction)`);
      }
      
      return compressed;
    } catch (error: any) {
      this.logger.error(`Failed to compress fields for ${change.filename}`, error);
      // Return original change if compression fails
      return change;
    }
  }

  /**
   * Start polling for new comments
   * Polls until analysis status is 'completed' or 'failed'
   * @param dataId - The extension_data_id to poll for
   * @param onComment - Callback when new comments arrive
   * @param onComplete - Callback when analysis is done
   */
  public startCommentPolling(
    dataId: string,
    onComment: (comment: any) => void,
    onComplete?: () => void
  ): void {
    this.logger.info('🔄 Starting status-based comment polling', { dataId });
    this.stopCommentPolling(dataId);

    let totalFetched = 0;
    let pollCount = 0;
    const MAX_POLLS = 1000; // Safety limit (~33 minutes at 2s intervals)

    const poll = async () => {
      pollCount++;
      
      try {
        // Check analysis status first
        const statusUrl = `/extension/status/${dataId}`;
        this.logger.info(`📊 Checking status (poll #${pollCount})...`);
        
        const statusResponse = await this.apiClient.get<{
          analysis_status: string;
          data_id: string;
        }>(statusUrl);

        const analysisStatus = statusResponse.analysis_status;
        this.logger.info(`Status: ${analysisStatus}`);

        // Fetch comments
        const commentsUrl = `/extension/comments/${dataId}`;
        const response = await this.apiClient.get<{
          comments: any[];
          count: number;
        }>(commentsUrl);

        this.logger.info(`📥 Poll #${pollCount}:`, {
          status: analysisStatus,
          newComments: response.comments.length,
          totalFetched
        });

        if (response.comments.length > 0) {
          totalFetched += response.comments.length;
          
          this.logger.info(`✅ Got ${response.comments.length} new comments. Processing...`);
          
          response.comments.forEach((comment, index) => {
            this.logger.info(`Comment ${index + 1}:`, {
              file: comment.file_path,
              line: comment.line_start,
              severity: comment.severity
            });
            
            try {
              onComment(comment);
            } catch (error) {
              this.logger.error(`❌ Error in onComment callback for comment ${index + 1}`, error);
            }
          });
        }

        // Check if analysis is complete
        if (analysisStatus === 'completed' || analysisStatus === 'failed') {
          this.logger.info(`🏁 Analysis ${analysisStatus}. Stopping polling.`, {
            totalComments: totalFetched,
            totalPolls: pollCount
          });
          this.stopCommentPolling(dataId);
          onComplete?.();
          return;
        }

        // Safety check - stop if we've polled too many times
        if (pollCount >= MAX_POLLS) {
          this.logger.warn(`⚠️ Reached maximum poll limit (${MAX_POLLS}). Stopping.`);
          this.stopCommentPolling(dataId);
          onComplete?.();
          return;
        }

        // If still running, continue polling
        if (analysisStatus === 'running' || analysisStatus === 'pending') {
          this.logger.info(`⏳ Analysis still ${analysisStatus}. Will poll again in 10s...`);
        }

      } catch (error) {
        this.logger.error('❌ Polling error', error);
        
        // On error, check a few times then give up
        if (pollCount >= 5) {
          this.logger.error(`🛑 Stopping polling due to repeated errors`);
          this.stopCommentPolling(dataId);
          onComplete?.();
        }
      }
    };

    poll();  // Poll immediately
    const interval = setInterval(poll, 10000);  // Then every 10s
    this.pollingIntervals.set(dataId, interval);
    this.logger.info(`⏰ Polling interval set for ${dataId} (status-based)`);
  }

  /**
   * Get analysis status
   */
  public async getAnalysisStatus(dataId: string): Promise<{ analysis_status: string; data_id: string }> {
    try {
      const statusUrl = `/extension/status/${dataId}`;
      const response = await this.apiClient.get<{
        analysis_status: string;
        data_id: string;
      }>(statusUrl);
      return response;
    } catch (error) {
      this.logger.error('Failed to get analysis status', error);
      throw error;
    }
  }

  /**
   * Stop polling for a specific dataId
   */
  public stopCommentPolling(dataId: string): void {
    const interval = this.pollingIntervals.get(dataId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(dataId);
      this.logger.info('Stopped polling', { dataId });
    }
  }

  /**
   * Stop a running extension analysis
   * @param dataId - The extension_data_id to stop
   */
  public async stopReview(dataId: string): Promise<{ analysis_status: string; data_id: string } | null> {
    try {
      this.logger.info('Stopping review', { dataId });
      const response = await this.apiClient.post<any>(`/extension/stop/${dataId}`, {});
      
      // Also stop polling if it's running
      this.stopCommentPolling(dataId);
      
      return {
        analysis_status: response.data.analysis_status,
        data_id: response.data.data_id
      };
    } catch (error) {
      this.logger.error('Failed to stop review', error);
      return null;
    }
  }
}
