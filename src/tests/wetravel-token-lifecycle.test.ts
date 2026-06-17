import { WeTravelTokenManager } from '../services/integrations/wetravel-token-manager';

describe('WeTravel Token Lifecycle - Unit Tests', () => {
    let integrationDataService: any;
    let authClient: any;
    let tokenManager: WeTravelTokenManager;

    beforeEach(() => {
        integrationDataService = {
            getIntegrationConfig: jest.fn(),
            getWeTravelCredentials: jest.fn(),
            saveIntegrationConfig: jest.fn()
        };

        authClient = {
            exchangeBearerToken: jest.fn()
        };

        tokenManager = new WeTravelTokenManager(integrationDataService, authClient, {
            refreshBufferMs: 5 * 60 * 1000
        });
    });

    it('returns a stored access token when it is not expiring soon', async () => {
        const storedToken = 'stored-token-123';
        integrationDataService.getIntegrationConfig.mockResolvedValue({
            wetravel_access_token: storedToken,
            wetravel_access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
            wetravel_status: 'connected',
            wetravel_status_error: null
        });
        integrationDataService.getWeTravelCredentials.mockResolvedValue({ apiKey: 'seed-token' });

        const token = await tokenManager.getAccessToken();

        expect(token).toBe(storedToken);
        expect(authClient.exchangeBearerToken).not.toHaveBeenCalled();
    });

    it('exchanges the seed token when the stored token is expired', async () => {
        integrationDataService.getIntegrationConfig.mockResolvedValue({
            wetravel_access_token: 'expired-token',
            wetravel_access_token_expires_at: new Date(Date.now() - 60 * 1000),
            wetravel_status: 'connected',
            wetravel_status_error: null
        });
        integrationDataService.getWeTravelCredentials.mockResolvedValue({ apiKey: 'seed-token' });
        authClient.exchangeBearerToken.mockResolvedValue({
            access_token: 'fresh-token',
            expires_at: Date.now() + 60 * 60 * 1000,
            token_type: 'Bearer'
        });

        const token = await tokenManager.getAccessToken();

        expect(token).toBe('fresh-token');
        expect(authClient.exchangeBearerToken).toHaveBeenCalledWith('seed-token');
        expect(integrationDataService.saveIntegrationConfig).toHaveBeenCalledWith(expect.objectContaining({
            wetravel_access_token: 'fresh-token',
            wetravel_status: 'connected',
            wetravel_status_error: null
        }));
    });

    it('shares one refresh promise across concurrent callers', async () => {
        let resolveExchange: (value: any) => void;
        const exchangePromise = new Promise(resolve => {
            resolveExchange = resolve;
        });

        integrationDataService.getIntegrationConfig.mockResolvedValue(null);
        integrationDataService.getWeTravelCredentials.mockResolvedValue({ apiKey: 'seed-token' });
        authClient.exchangeBearerToken.mockReturnValue(exchangePromise);

        const firstCall = tokenManager.getAccessToken();
        const secondCall = tokenManager.getAccessToken();

        resolveExchange!({
            access_token: 'shared-token',
            expires_at: Date.now() + 60 * 60 * 1000,
            token_type: 'Bearer'
        });

        await expect(firstCall).resolves.toBe('shared-token');
        await expect(secondCall).resolves.toBe('shared-token');
        expect(authClient.exchangeBearerToken).toHaveBeenCalledTimes(1);
    });

    it('persists missing credential state when no seed token is available', async () => {
        integrationDataService.getIntegrationConfig.mockResolvedValue(null);
        integrationDataService.getWeTravelCredentials.mockResolvedValue(null);

        await expect(tokenManager.getAccessToken()).rejects.toThrow('WeTravel seed token is missing');
        expect(integrationDataService.saveIntegrationConfig).toHaveBeenCalledWith(expect.objectContaining({
            wetravel_status: 'missing_credentials',
            wetravel_status_error: 'WeTravel seed token is missing'
        }));
    });

    it('reports auth health from the stored integration config', async () => {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        integrationDataService.getIntegrationConfig.mockResolvedValue({
            wetravel_access_token: 'token-1',
            wetravel_access_token_expires_at: expiresAt,
            wetravel_status: 'connected',
            wetravel_status_error: null
        });

        const health = await tokenManager.getAuthHealth();

        expect(health).toEqual(expect.objectContaining({
            status: 'connected',
            error: null,
            accessTokenExpiresAt: expiresAt,
            isAccessTokenExpiringSoon: false
        }));
    });
});
