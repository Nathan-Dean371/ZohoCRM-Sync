import { URLSearchParams } from 'url';

export interface WeTravelBearerToken {
    access_token: string;
    expires_at: number;
    refresh_token?: string;
    token_type?: string;
    metadata?: Record<string, unknown>;
}

export interface WeTravelAuthClient {
    exchangeBearerToken(seedToken: string, orgId: string): Promise<WeTravelBearerToken>;
}

export interface WeTravelAuthServiceOptions {
    apiBaseUrl?: string;
    tokenEndpoint?: string;
}

export class WeTravelAuthService implements WeTravelAuthClient {
    private readonly apiBaseUrl: string;
    private readonly tokenEndpoint: string;

    constructor(options: WeTravelAuthServiceOptions = {}) {
        this.apiBaseUrl = options.apiBaseUrl || process.env.WETRAVEL_API_BASE_URL || 'https://api.wetravel.com';
        this.tokenEndpoint = options.tokenEndpoint || process.env.WETRAVEL_TOKEN_URL || `${this.apiBaseUrl}/oauth/token`;
    }

    async exchangeBearerToken(seedToken: string, orgId: string): Promise<WeTravelBearerToken> {
        const formBody = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: seedToken,
            organization_id: orgId
        });

        const response = await fetch(this.tokenEndpoint, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody.toString()
        });

        if (!response.ok) {
            throw new Error(`WeTravel token exchange failed with HTTP ${response.status}`);
        }

        const payload = await response.json() as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            token_type?: string;
            scope?: string;
            [key: string]: unknown;
        };

        if (!payload.access_token || typeof payload.expires_in !== 'number') {
            throw new Error('WeTravel token exchange response was missing required token fields');
        }

        return {
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            expires_at: Date.now() + (payload.expires_in * 1000),
            token_type: payload.token_type || 'Bearer',
            metadata: {
                organization_id: orgId,
                scope: payload.scope ?? null,
                token_type: payload.token_type || 'Bearer',
                expires_in: payload.expires_in
            }
        };
    }
}

export default WeTravelAuthService;