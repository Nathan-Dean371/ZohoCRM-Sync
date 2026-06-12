// This class extends the built-in Error class to add specific information about API errors
export class APIError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public originalError?: any
    ) {
        super(message);
        this.name = 'APIError';
        
        // This ensures proper stack traces in TypeScript
        Object.setPrototypeOf(this, APIError.prototype);
    }

    /**
     * Identifies if the error is non-retryable (e.g., 400 Bad Request, permanent 401)
     */
    isNonRetryable(): boolean {
        // 400 (Bad Request) is typically non-retryable as the payload is invalid
        // 401 (Unauthorized) might be retryable if token refresh is possible, 
        // but if it persists after refresh it should be non-retryable.
        // For now, we'll treat 400 as non-retryable.
        return this.statusCode === 400;
    }
}

// This class handles specific Ventrata API errors
export class VentrataAPIError extends APIError {
    constructor(
        statusCode: number,
        message: string,
        public errorCode?: string,
        originalError?: any
    ) {
        super(statusCode, message, originalError);
        this.name = 'VentrataAPIError';
    }
}

export class WorkerError extends Error {
    constructor(message: string, public originalError?: any) {
        super(message);
        this.name = 'WorkerError';
        Object.setPrototypeOf(this, WorkerError.prototype);
    }
}

/**
 * Global helper to determine if an error should NOT be retried by the worker
 */
export function isNonRetryableError(error: any): boolean {
    if (error instanceof APIError) {
        return error.isNonRetryable();
    }
    
    // Check for common Zoho error messages that indicate permanent failure
    const message = error.message?.toLowerCase() || '';
    if (message.includes('invalid data') || message.includes('mandatory field missing')) {
        return true;
    }

    return false;
}