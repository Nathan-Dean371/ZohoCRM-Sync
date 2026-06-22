import axios from 'axios';

interface ZohoToken {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    expires_at?: number;  // We'll calculate this
    api_domain: string;
    token_type: string;
}

class ZohoAuthService {
    private token: ZohoToken | null = null;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;
    private readonly accountsUrl: string;

    constructor() {
        // Get required environment variables
        this.clientId = process.env.ZOHO_CLIENT_ID || '';
        this.clientSecret = process.env.ZOHO_CLIENT_SECRET || '';
        this.redirectUri = process.env.ZOHO_REDIRECT_URI || '';
        this.accountsUrl = process.env.ZOHO_DOMAIN || 'https://accounts.zoho.com';

        // Validate required configuration for basic operation
        if (!this.clientId || !this.clientSecret) {
            console.warn('Missing Zoho CLIENT_ID or CLIENT_SECRET');
        }
    }

    getAuthorizationUrl(): string {
        const scopes = [
            'ZohoCRM.modules.ALL',
            'ZohoCRM.users.ALL',
            'ZohoCRM.settings.ALL'
        ].join(',');

        return `${this.accountsUrl}/oauth/v2/auth?scope=${scopes}&client_id=${this.clientId}&response_type=code&access_type=offline&redirect_uri=${this.redirectUri}&prompt=consent`;
    }

    async exchangeCodeForTokens(code: string): Promise<ZohoToken> {
        try {
            const response = await axios.post(`${this.accountsUrl}/oauth/v2/token`, null, {
                params: {
                    code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: this.redirectUri,
                    grant_type: 'authorization_code'
                }
            });

            if (response.data.error) {
                throw new Error(`Zoho OAuth Error: ${response.data.error}`);
            }

            return {
                ...response.data,
                expires_at: Date.now() + (response.data.expires_in * 1000)
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to exchange code: ${error.response?.data?.error || error.message}`);
            }
            throw error;
        }
    }

    private isTokenExpired(): boolean {
        if (!this.token?.expires_at) return true;
        // Add 30-second buffer to prevent edge cases
        return Date.now() >= (this.token.expires_at - 30000);
    }

    async refreshAccessToken(refreshToken: string): Promise<ZohoToken> {
        try {
            const response = await axios.post(`${this.accountsUrl}/oauth/v2/token`, null, {
                params: {
                    refresh_token: refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token'
                }
            });

            if (response.data.error) {
                throw new Error(`Zoho Token Refresh Error: ${response.data.error}`);
            }

            const token: ZohoToken = {
                ...response.data,
                expires_at: Date.now() + (response.data.expires_in * 1000)
            };
            this.token = token;
            return token;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to refresh access token: ${error.response?.data?.error || error.message}`);
            }
            throw error;
        }
    }
    
    async getAccessToken(refreshToken: string): Promise<string> {
        if (!this.token || this.isTokenExpired()) {
            await this.refreshAccessToken(refreshToken);
        }
        return this.token!.access_token;
    }
}

export { ZohoToken };
export default ZohoAuthService;