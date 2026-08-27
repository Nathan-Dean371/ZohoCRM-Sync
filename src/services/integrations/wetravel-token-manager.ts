import { type IntegrationConfigInput, type IntegrationDataService } from './integration-config-service';
import { type WeTravelAuthClient, type WeTravelBearerToken } from './wetravel-auth';

export interface WeTravelTokenManagerOptions {
    refreshBufferMs?: number;
}

export interface WeTravelAuthHealth {
    status: string | null;
    error: string | null;
    accessTokenExpiresAt: Date | null;
    isAccessTokenExpiringSoon: boolean;
}

export class WeTravelTokenManager {
    private readonly refreshBufferMs: number;
    private refreshPromise: Promise<string> | null = null;

    constructor(
        private readonly integrationDataService: IntegrationDataService,
        private readonly authClient: WeTravelAuthClient,
        options: WeTravelTokenManagerOptions = {}
    ) {
        this.refreshBufferMs = options.refreshBufferMs ?? 60000;
    }

    async getAccessToken(): Promise<string> {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = this.resolveAccessToken();
        return this.refreshPromise;
    }

    async getAuthHealth(): Promise<WeTravelAuthHealth> {
        const config = await this.integrationDataService.getIntegrationConfig();

        if (!config) {
            return {
                status: null,
                error: null,
                accessTokenExpiresAt: null,
                isAccessTokenExpiringSoon: false
            };
        }

        const accessTokenExpiresAt = config.wetravel_access_token_expires_at ?? null;
        const isAccessTokenExpiringSoon = accessTokenExpiresAt ? this.isExpiringSoon(accessTokenExpiresAt) : false;

        return {
            status: config.wetravel_status || (config.wetravel_access_token ? 'connected' : null),
            error: config.wetravel_status_error || null,
            accessTokenExpiresAt,
            isAccessTokenExpiringSoon
        };
    }

    private async refreshAccessToken(seedToken: string, orgId?: string | null): Promise<string> {
        try {
            const token = await this.authClient.exchangeBearerToken(seedToken);
            await this.saveTokenState(token, orgId);
            return token.access_token;
        } catch (error) {
            const message = this.toOperatorMessage(error);
            await this.integrationDataService.saveIntegrationConfig({
                wetravel_status: 'exchange_failed',
                wetravel_status_error: message
            });
            throw new Error(message);
        } finally {
            this.refreshPromise = null;
        }
    }

    private async resolveAccessToken(): Promise<string> {
        try {
            const [config, credentials] = await Promise.all([
                this.integrationDataService.getIntegrationConfig(),
                this.integrationDataService.getWeTravelCredentials()
            ]);

            if (config?.wetravel_access_token && config.wetravel_access_token_expires_at && !this.isExpiringSoon(config.wetravel_access_token_expires_at)) {
                return config.wetravel_access_token;
            }

            if (!credentials?.apiKey) {
                const message = 'WeTravel seed token is missing';
                await this.integrationDataService.saveIntegrationConfig({
                    wetravel_status: 'missing_credentials',
                    wetravel_status_error: message
                });
                throw new Error(message);
            }

            return await this.refreshAccessToken(credentials.apiKey, credentials.orgId);
        } finally {
            this.refreshPromise = null;
        }
    }

    private async saveTokenState(token: WeTravelBearerToken, orgId?: string | null): Promise<void> {
        const metadata = {
            ...(token.metadata || {}),
            token_type: token.token_type || 'Bearer'
        };

        const update: IntegrationConfigInput = {
            wetravel_access_token: token.access_token,
            wetravel_access_token_expires_at: new Date(token.expires_at),
            wetravel_token_metadata: metadata,
            wetravel_status: 'connected',
            wetravel_status_error: null
        };

        if (token.refresh_token) {
            update.wetravel_token_metadata = {
                ...metadata,
                refresh_token_rotated: true
            };
        }

        await this.integrationDataService.saveIntegrationConfig(update);

        // WeTravel rotates the refresh token on every exchange; persist it as the new seed
        // so the next refresh doesn't reuse an already-consumed token and get a 403.
        if (token.refresh_token) {
            await this.integrationDataService.saveWeTravelCredentials(
                { apiKey: token.refresh_token, orgId: orgId ?? null },
                'connected'
            );
        }
    }

    private isExpiringSoon(expiresAt: Date): boolean {
        return expiresAt.getTime() <= Date.now() + this.refreshBufferMs;
    }

    private toOperatorMessage(error: unknown): string {
        if (error instanceof Error && error.message) {
            return `WeTravel bearer token exchange failed: ${error.message}`;
        }

        return 'WeTravel bearer token exchange failed';
    }
}

export default WeTravelTokenManager;