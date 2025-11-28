import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from '../utils/logger';
import { AuthenticationProvider } from '../authentication/AuthenticationProvider';
import { BEETLE_API_BASE_URL } from '../utils/constants';

export class ApiClient {
  private client: AxiosInstance;
  private authProvider: AuthenticationProvider;
  private logger: Logger;

  constructor(authProvider: AuthenticationProvider, logger: Logger) {
    this.authProvider = authProvider;
    this.logger = logger;

    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: BEETLE_API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      async (config) => {
        const token = await this.authProvider.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server responded with error status
          this.logger.error(
            `API Error: ${error.response.status} - ${error.response.statusText}`,
            error.response.data
          );

          // Handle 401 Unauthorized - token might be invalid
          if (error.response.status === 401) {
            this.logger.warn('Unauthorized request - token may be invalid');
          }
        } else if (error.request) {
          // Request was made but no response received
          this.logger.error('No response received from API', error.request);
        } else {
          // Something else happened
          this.logger.error('API request setup error', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a GET request
   */
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  /**
   * Make a POST request
   */
  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Make a PUT request
   */
  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Make a DELETE request
   */
  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}
