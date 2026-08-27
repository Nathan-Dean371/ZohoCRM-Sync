import { URLSearchParams } from 'url';

export interface WeTravelBearerToken {
    access_token: string;
    expires_at: number;
    refresh_token?: string;
    token_type?: string;
    metadata?: Record<string, unknown>;
}

export interface WeTravelAuthClient {
    exchangeBearerToken(seedToken: string, orgId?: string): Promise<WeTravelBearerToken>;
}

export interface WeTravelAuthServiceOptions {
    apiBaseUrl?: string;
    tokenEndpoint?: string;
}

export class WeTravelAuthService implements WeTravelAuthClient {
    private readonly apiBaseUrl: string;
    private readonly tokenEndpoint: string;

    constructor(options: WeTravelAuthServiceOptions = {}) {
        const configuredBaseUrl = options.apiBaseUrl || process.env.WETRAVEL_API_BASE_URL || 'https://api.wetravel.com/v2';
        this.apiBaseUrl = this.normalizeApiBaseUrl(configuredBaseUrl);
        // Use v2 auth/tokens/access endpoint by default per WeTravel v2 docs.
        this.tokenEndpoint = options.tokenEndpoint || process.env.WETRAVEL_TOKEN_URL || `${this.apiBaseUrl}/auth/tokens/access`;
    }

    async exchangeBearerToken(seedToken: string, orgId?: string): Promise<WeTravelBearerToken> {
        const response = await fetch(this.tokenEndpoint, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'OCTOtoCRM-Integration/1.0 (+https://octotocrm-production.up.railway.app)',
                Authorization: `Bearer ${seedToken}`
            }
        });

        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
            } catch {
                // ignore body read failures
            }
            console.error('WeTravel token exchange rejected:', {
                status: response.status,
                endpoint: this.tokenEndpoint,
                body: errorBody
            });
            throw new Error(`WeTravel token exchange failed with HTTP ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
        }

        const payload = await response.json() as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            token_type?: string;
            scope?: string;
            [key: string]: unknown;
        };

        console.log('WeTravel token exchange response:', JSON.stringify(payload, null, 2));

        if (!payload.access_token) {
            console.error('WeTravel token exchange validation failed: missing access_token');
            throw new Error('WeTravel token exchange response was missing access_token');
        }

        // WeTravel v2 API returns JWT tokens with exp claim embedded
        // Extract expiration from JWT if expires_in is not provided
        let expiresAt: number;
        let expiresIn: number;

        if (typeof payload.expires_in === 'number') {
            expiresIn = payload.expires_in;
            expiresAt = Date.now() + (expiresIn * 1000);
        } else {
            // Decode JWT to extract exp claim
            const jwtPayload = this.decodeJwt(payload.access_token);
            if (jwtPayload.exp) {
                // exp is in seconds, convert to milliseconds
                expiresAt = jwtPayload.exp * 1000;
                expiresIn = Math.floor((expiresAt - Date.now()) / 1000);
                console.log('Extracted expiration from JWT:', { expiresAt: new Date(expiresAt), expiresIn });
            } else {
                // Fallback: assume 1 hour (WeTravel default)
                expiresIn = 3600;
                expiresAt = Date.now() + (expiresIn * 1000);
                console.warn('No expiration found in JWT, using default 1 hour');
            }
        }

        return {
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            expires_at: expiresAt,
            token_type: payload.token_type || 'Bearer',
            metadata: {
                scope: payload.scope ?? null,
                token_type: payload.token_type || 'Bearer',
                expires_in: expiresIn
            }
        };
    }

    private decodeJwt(token: string): { exp?: number; iat?: number; [key: string]: any } {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return {};
            }
            // Decode base64url payload (second part)
            const payload = parts[1];
            const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(base64, 'base64').toString('utf-8');
            return JSON.parse(decoded);
        } catch (error) {
            console.warn('Failed to decode JWT:', error);
            return {};
        }
    }

    private normalizeApiBaseUrl(apiBaseUrl: string): string {
        const trimmedBase = apiBaseUrl.replace(/\/$/, '');

        if (trimmedBase.endsWith('/v2')) {
            return trimmedBase;
        }

        return `${trimmedBase}/v2`;
    }
}

export default WeTravelAuthService;