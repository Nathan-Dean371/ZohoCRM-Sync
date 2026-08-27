import axios from 'axios';
import ZohoAuthService from '../services/zoho/zoho-auth';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ZohoAuthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ZOHO_CLIENT_ID = 'client-id';
        process.env.ZOHO_CLIENT_SECRET = 'client-secret';
        process.env.ZOHO_REDIRECT_URI = 'https://example.com/callback';
        process.env.ZOHO_DOMAIN = 'https://accounts.zoho.com';
    });

    test('builds authorization URL with required scopes', () => {
        const authService = new ZohoAuthService();
        const authUrl = authService.getAuthorizationUrl();

        expect(authUrl).toContain('https://accounts.zoho.com/oauth/v2/auth');
        expect(authUrl).toContain('client_id=client-id');
        expect(authUrl).toContain('response_type=code');
        expect(authUrl).toContain('access_type=offline');
    });

    test('normalizes redirect URI when protocol is missing', () => {
        process.env.ZOHO_REDIRECT_URI = 'octotocrm-production.up.railway.app/admin/dashboard/integrations/zoho/callback';

        const authService = new ZohoAuthService();
        const authUrl = authService.getAuthorizationUrl();

        expect(authUrl).toContain(
            'redirect_uri=https%3A%2F%2Foctotocrm-production.up.railway.app%2Fadmin%2Fdashboard%2Fintegrations%2Fzoho%2Fcallback'
        );
    });

    test('exchanges authorization code for tokens', async () => {
        const authService = new ZohoAuthService();
        mockedAxios.post.mockResolvedValue({
            data: {
                access_token: 'access-token',
                refresh_token: 'refresh-token',
                expires_in: 3600,
                api_domain: 'https://www.zohoapis.com',
                token_type: 'Bearer'
            }
        } as any);

        const token = await authService.exchangeCodeForTokens('auth-code-123');

        expect(token.access_token).toBe('access-token');
        expect(token.refresh_token).toBe('refresh-token');
        expect(token.expires_at).toBeDefined();
    });
});