/**
 * Centralized caching system for FinTrack
 * Provides in-memory caching with TTL, metrics tracking, and query deduplication
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

interface CacheMetrics {
  totalHits: number;
  totalMisses: number;
  evictions: number;
  hitRate: number;
}

export type CacheTTL = 'INSTANT' | 'SHORT' | 'MEDIUM' | 'LONG' | 'VERY_LONG';

// TTL configurations (in milliseconds)
const TTL_CONFIG: Record<CacheTTL, number> = {
  INSTANT: 1000,        // 1 second - for real-time data
  SHORT: 5 * 1000,      // 5 seconds
  MEDIUM: 30 * 1000,    // 30 seconds - default for market data
  LONG: 5 * 60 * 1000,  // 5 minutes - for exchange rates, less volatile data
  VERY_LONG: 60 * 60 * 1000, // 1 hour - for static data
};

// Max cache sizes per category to prevent memory bloat
const MAX_CACHE_SIZE: Record<string, number> = {
  chart: 200,
  market: 150,
  analyze: 100,
  exchange: 50,
  search: 100,
};

class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttl: number;
  private metrics: CacheMetrics = {
    totalHits: 0,
    totalMisses: 0,
    evictions: 0,
    hitRate: 0,
  };
  private maxSize: number;
  private category: string;

  constructor(ttl: CacheTTL = 'MEDIUM', maxSize: number = 100, category: string = 'default') {
    this.ttl = TTL_CONFIG[ttl];
    this.maxSize = maxSize;
    this.category = category;
  }

  /**
   * Get value from cache if it exists and hasn't expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.totalMisses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.metrics.totalMisses++;
      return null;
    }

    entry.hits++;
    this.metrics.totalHits++;
    this.updateHitRate();
    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0]?.[0];

      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.metrics.evictions++;
      }
    }

    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Clear all entries (useful for cleanup/resets)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Update hit rate percentage
   */
  private updateHitRate(): void {
    const total = this.metrics.totalHits + this.metrics.totalMisses;
    this.metrics.hitRate = total > 0 ? Math.round((this.metrics.totalHits / total) * 100) : 0;
  }

  /**
   * Delete specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

// Dedicated cache instances for different data types
export const chartCache = new CacheManager<any>('MEDIUM', MAX_CACHE_SIZE['chart'], 'chart');
export const marketCache = new CacheManager<any>('SHORT', MAX_CACHE_SIZE['market'], 'market');
export const analyzeCache = new CacheManager<any>('INSTANT', MAX_CACHE_SIZE['analyze'], 'analyze');
export const exchangeCache = new CacheManager<any>('LONG', MAX_CACHE_SIZE['exchange'], 'exchange');
export const searchCache = new CacheManager<any>('LONG', MAX_CACHE_SIZE['search'], 'search');

/**
 * Query deduplication - prevents duplicate API calls for same request within time window
 */
class QueryDeduplicator {
  private pending: Map<string, Promise<any>> = new Map();

  /**
   * Execute query or return existing pending promise if same query is in-flight
   */
  async dedupe<T>(key: string, queryFn: () => Promise<T>): Promise<T> {
    // If request already in-flight, return that promise
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    // Execute query and track it
    const promise = queryFn()
      .then((result) => {
        this.pending.delete(key);
        return result;
      })
      .catch((error) => {
        this.pending.delete(key);
        throw error;
      });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Get number of pending queries
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear all pending queries (use with caution)
   */
  clearPending(): void {
    this.pending.clear();
  }
}

export const queryDeduplicator = new QueryDeduplicator();

/**
 * Utility function to generate cache key from parameters
 */
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('|');

  return `${prefix}:${sortedParams}`;
}

/**
 * Get combined cache metrics across all cache instances
 */
export function getAllCacheMetrics() {
  return {
    chart: chartCache.getMetrics(),
    market: marketCache.getMetrics(),
    analyze: analyzeCache.getMetrics(),
    exchange: exchangeCache.getMetrics(),
    search: searchCache.getMetrics(),
    sizes: {
      chart: chartCache.size(),
      market: marketCache.size(),
      analyze: analyzeCache.size(),
      exchange: exchangeCache.size(),
      search: searchCache.size(),
    },
  };
}

/**
 * Clear all caches (use with caution - for debugging/reset)
 */
export function clearAllCaches(): void {
  chartCache.clear();
  marketCache.clear();
  analyzeCache.clear();
  exchangeCache.clear();
  searchCache.clear();
}
