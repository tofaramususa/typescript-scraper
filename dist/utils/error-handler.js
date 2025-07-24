export class SimpleErrorHandler {
    errorCounts = new Map();
    handle(error, context, operation) {
        const err = this.normalizeError(error);
        const retryable = this.isRetryable(err);
        const errorType = err.constructor.name;
        this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
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
    normalizeError(error) {
        if (error instanceof Error) {
            return error;
        }
        if (typeof error === 'string') {
            return new Error(error);
        }
        return new Error('Unknown error occurred');
    }
    isRetryable(error) {
        const message = error.message.toLowerCase();
        if (message.includes('timeout') ||
            message.includes('network') ||
            message.includes('econnreset') ||
            message.includes('enotfound')) {
            return true;
        }
        if (message.includes('rate limit') || message.includes('429')) {
            return true;
        }
        if (message.includes('500') || message.includes('502') || message.includes('503')) {
            return true;
        }
        if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) {
            return false;
        }
        return true;
    }
    getStats() {
        return Object.fromEntries(this.errorCounts);
    }
}
export async function withRetry(operation, maxRetries = 3, baseDelay = 1000, context = 'operation') {
    const errorHandler = new SimpleErrorHandler();
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            const handled = errorHandler.handle(error, context, `attempt ${attempt}`);
            lastError = handled.error;
            if (!handled.retryable || attempt === maxRetries) {
                throw lastError;
            }
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`   ⏳ Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
export async function safeAsync(operation, defaultValue, context = 'operation') {
    try {
        const data = await operation();
        return { success: true, data };
    }
    catch (error) {
        const errorHandler = new SimpleErrorHandler();
        const handled = errorHandler.handle(error, context, 'safeAsync');
        return {
            success: false,
            data: defaultValue,
            error: handled.error.message
        };
    }
}
//# sourceMappingURL=error-handler.js.map