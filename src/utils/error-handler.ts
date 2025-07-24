/**
 * Simple error handling utilities
 */

export interface ErrorWithContext {
  error: Error;
  context: string;
  operation: string;
  retryable: boolean;
}

/**
 * Simple error handler that logs and categorizes errors
 */
export class SimpleErrorHandler {
  private errorCounts = new Map<string, number>();

  /**
   * Handle an error with context
   */
  handle(error: unknown, context: string, operation: string): ErrorWithContext {
    const err = this.normalizeError(error);
    const retryable = this.isRetryable(err);
    
    // Count errors by type
    const errorType = err.constructor.name;
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
    
    // Log error with context
    console.error(`❌ ${operation} failed in ${context}:`, err.message);
    if (!retryable) {
      console.error(`   🚫 Non-retryable error, skipping...`);
    }
    
    return {
      error: err,
      context,
      operation,
      retryable,
    };
  }

  /**
   * Convert unknown error to Error object
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string') {
      return new Error(error);
    }
    return new Error('Unknown error occurred');
  }

  /**
   * Determine if error is retryable
   */
  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Network/timeout errors - retryable
    if (message.includes('timeout') || 
        message.includes('network') || 
        message.includes('econnreset') ||
        message.includes('enotfound')) {
      return true;
    }
    
    // Rate limit errors - retryable
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }
    
    // Server errors (5xx) - retryable
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }
    
    // Client errors (4xx except rate limit) - not retryable
    if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) {
      return false;
    }
    
    // Default: assume retryable for safety
    return true;
  }

  /**
   * Get error statistics
   */
  getStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }
}

/**
 * Simple retry wrapper
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  context: string = 'operation'
): Promise<T> {
  const errorHandler = new SimpleErrorHandler();
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const handled = errorHandler.handle(error, context, `attempt ${attempt}`);
      lastError = handled.error;
      
      if (!handled.retryable || attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`   ⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Safe async wrapper that doesn't throw
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  context: string = 'operation'
): Promise<{ success: boolean; data: T; error?: string }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const errorHandler = new SimpleErrorHandler();
    const handled = errorHandler.handle(error, context, 'safeAsync');
    return { 
      success: false, 
      data: defaultValue, 
      error: handled.error.message 
    };
  }
}