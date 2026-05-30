/**
 * Network Resilience Module
 * Provides retry logic with exponential backoff, offline detection, and request queuing
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

interface QueuedRequest {
  id: string;
  url: string;
  options: RequestInit;
  resolve: (value: Response) => void;
  reject: (reason?: any) => void;
  timestamp: number;
}

class NetworkManager {
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private queue: Map<string, QueuedRequest> = new Map();
  private pendingSync = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  /**
   * Fetch with exponential backoff retry logic
   */
  async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: RetryOptions = {}
  ): Promise<Response> {
    const {
      maxRetries = 3,
      initialDelayMs = 1000,
      maxDelayMs = 10000,
      backoffMultiplier = 2,
    } = retryOptions;

    let lastError: Error | null = null;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(10000), // 10s timeout per request
        });

        // Retry on specific status codes (5xx errors, 429 rate limit, 408 timeout)
        if (
          response.ok ||
          (response.status !== 408 &&
            response.status !== 429 &&
            response.status < 500)
        ) {
          return response;
        }

        // For retryable errors, continue to next attempt
        if (attempt < maxRetries) {
          const retryAfter = response.headers.get('Retry-After');
          delay = retryAfter ? parseInt(retryAfter) * 1000 : delay;
          await this.sleep(delay);
          delay = Math.min(delay * backoffMultiplier, maxDelayMs);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (except timeout/rate limit)
        if (attempt >= maxRetries) {
          throw lastError;
        }

        // Wait before retry with exponential backoff
        await this.sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Queue a request for offline handling
   */
  async queueRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const id = `${url}-${Date.now()}-${Math.random()}`;
      const queued: QueuedRequest = {
        id,
        url,
        options,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.queue.set(id, queued);

      // If online, try to send immediately
      if (this.isOnline) {
        this.processQueue();
      } else {
        // Store for later sync
        this.saveQueueToLocalStorage();
      }
    });
  }

  /**
   * Process queued requests when connection restored
   */
  private async processQueue(): Promise<void> {
    if (this.pendingSync || this.queue.size === 0) return;

    this.pendingSync = true;
    const entries = Array.from(this.queue.entries());

    for (const [id, request] of entries) {
      try {
        const response = await this.fetchWithRetry(request.url, request.options);
        request.resolve(response);
        this.queue.delete(id);
      } catch (error) {
        request.reject(error);
        this.queue.delete(id);
      }
    }

    this.pendingSync = false;

    // Clear localStorage if queue is now empty
    if (this.queue.size === 0) {
      localStorage.removeItem('fintrack_offline_queue');
    }
  }

  /**
   * Get current online/offline status
   */
  getStatus(): { isOnline: boolean; queuedRequests: number } {
    return {
      isOnline: this.isOnline,
      queuedRequests: this.queue.size,
    };
  }

  /**
   * Manually trigger queue sync (useful for polling)
   */
  async syncQueue(): Promise<void> {
    if (this.isOnline) {
      await this.processQueue();
    }
  }

  private handleOnline(): void {
    console.log('Network: Back online');
    this.isOnline = true;
    this.processQueue().catch(console.error);
  }

  private handleOffline(): void {
    console.log('Network: Going offline');
    this.isOnline = false;
    this.saveQueueToLocalStorage();
  }

  private saveQueueToLocalStorage(): void {
    try {
      const queueData = Array.from(this.queue.values()).map((req) => ({
        id: req.id,
        url: req.url,
        options: req.options,
        timestamp: req.timestamp,
      }));
      localStorage.setItem('fintrack_offline_queue', JSON.stringify(queueData));
    } catch (error) {
      console.error('Failed to save queue to localStorage:', error);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Load queued requests from localStorage (for persistence across page reloads)
   */
  loadQueueFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('fintrack_offline_queue');
      if (stored) {
        const data = JSON.parse(stored);
        // Re-queue the requests
        data.forEach((req: any) => {
          this.queueRequest(req.url, req.options).catch(console.error);
        });
      }
    } catch (error) {
      console.error('Failed to load queue from localStorage:', error);
    }
  }
}

// Singleton instance
export const networkManager = new NetworkManager();

/**
 * Hook-friendly fetch wrapper
 */
export async function safeFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  if (networkManager.getStatus().isOnline) {
    return networkManager.fetchWithRetry(url, options);
  } else {
    // Queue for later if offline
    return networkManager.queueRequest(url, options);
  }
}

/**
 * Specialized fetch for API routes
 */
export async function apiCall(
  endpoint: string,
  options?: RequestInit
): Promise<any> {
  try {
    const url = `${window.location.origin}/api${endpoint}`;
    const response = await networkManager.fetchWithRetry(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error(`API call failed: ${endpoint}`, error);
    throw error;
  }
}
