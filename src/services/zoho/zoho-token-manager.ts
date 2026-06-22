import ZohoAuthService from './zoho-auth';
import { IntegrationDataService, integrationDataService } from '../integrations/integration-config-service';

export interface ZohoTokenManagerOptions {
    maxConcurrency?: number;
    maxRetries?: number;
    initialDelay?: number;
}

export class ZohoTokenManager {
    private maxConcurrency: number;
    private maxRetries: number;
    private initialDelay: number;
    private activeRequests = 0;
    private queue: (() => void)[] = [];
    private refreshPromise: Promise<string> | null = null;

    constructor(
        private integrationDataService: IntegrationDataService,
        private zohoAuthService: ZohoAuthService,
        options: ZohoTokenManagerOptions = {}
    ) {
        this.maxConcurrency = options.maxConcurrency || 5;
        this.maxRetries = options.maxRetries || 3;
        this.initialDelay = options.initialDelay || 1000;
    }

    async getAccessToken(): Promise<string> {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        const config = await this.integrationDataService.getIntegrationConfig();

        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        if (!config?.zoho_refresh_token) {
            throw new Error('Zoho refresh token is missing');
        }

        const now = new Date();
        const buffer = 30000; // 30 seconds buffer
        
        if (config.access_token && config.expires_at && config.expires_at.getTime() > (now.getTime() + buffer)) {
            return config.access_token;
        }

        // Refresh token - use a promise to ensure only one refresh happens at a time
        this.refreshPromise = (async () => {
            try {
                const tokenData = await this.zohoAuthService.refreshAccessToken(config.zoho_refresh_token!);

                // Save to DB
                await this.integrationDataService.saveIntegrationConfig({
                    access_token: tokenData.access_token,
                    zoho_refresh_token: tokenData.refresh_token || undefined,
                    expires_at: new Date(tokenData.expires_at!),
                    token_metadata: {
                        api_domain: tokenData.api_domain,
                        token_type: tokenData.token_type
                    }
                });

                return tokenData.access_token;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    async withZohoToken<T>(
        fn: (token: string) => Promise<T>,
        options: ZohoTokenManagerOptions = {}
    ): Promise<T> {
        const maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
        const initialDelay = options.initialDelay !== undefined ? options.initialDelay : this.initialDelay;

        return this.enqueue(async () => {
            let lastError: any;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const token = await this.getAccessToken();
                    return await fn(token);
                } catch (error: any) {
                    lastError = error;
                    const status = error.response?.status;
                    
                    if (status === 429 || (status >= 500 && status < 600)) {
                        if (attempt < maxRetries) {
                            const delay = initialDelay * Math.pow(2, attempt);
                            console.log(`Zoho API error ${status}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                    }
                    throw error;
                }
            }
            throw lastError;
        });
    }

    private async enqueue<T>(task: () => Promise<T>): Promise<T> {
        if (this.activeRequests >= this.maxConcurrency) {
            await new Promise<void>(resolve => this.queue.push(resolve));
        }

        this.activeRequests++;
        try {
            return await task();
        } finally {
            this.activeRequests--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                if (next) next();
            }
        }
    }
}

export const zohoTokenManager = new ZohoTokenManager(
    integrationDataService,
    new ZohoAuthService()
);
