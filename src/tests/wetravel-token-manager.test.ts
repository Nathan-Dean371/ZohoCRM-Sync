import { WeTravelTokenManager } from '../services/integrations/wetravel-token-manager';

describe('WeTravelTokenManager', () => {
    let tokenManager: WeTravelTokenManager;
    let mockIntegrationDataService: jest.Mocked<any>;
    let mockAuthService: jest.Mocked<any>;

    beforeEach(() => {
        mockIntegrationDataService = {
            getIntegrationConfig: jest.fn(),
            saveIntegrationConfig: jest.fn(),
            getWeTravelCredentials: jest.fn()
        };

        mockAuthService = {
            exchangeBearerToken: jest.fn()
        };

        tokenManager = new WeTravelTokenManager(
            mockIntegrationDataService as any,
            mockAuthService as any
        );
    });

    it('refreshes an expiring bearer token before expiry and persists the new token', async () => {
        const now = Date.now();

        mockIntegrationDataService.getWeTravelCredentials.mockResolvedValue({
            apiKey: 'seed-token-123'
        });

        mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
            wetravel_access_token: 'cached-bearer-token',
            wetravel_access_token_expires_at: new Date(now + 15000),
            wetravel_status: 'connected',
            wetravel_status_error: null,
            wetravel_token_metadata: { cached: true }
        });

        mockAuthService.exchangeBearerToken.mockResolvedValue({
            access_token: 'fresh-bearer-token',
            expires_at: now + 3600 * 1000,
            token_type: 'Bearer',
            metadata: { response_source: 'refresh' }
        });

        const token = await tokenManager.getAccessToken();

        expect(token).toBe('fresh-bearer-token');
        expect(mockAuthService.exchangeBearerToken).toHaveBeenCalledWith('seed-token-123');
        expect(mockIntegrationDataService.saveIntegrationConfig).toHaveBeenCalledWith(expect.objectContaining({
            wetravel_access_token: 'fresh-bearer-token',
            wetravel_access_token_expires_at: expect.any(Date),
            wetravel_status: 'connected',
            wetravel_status_error: null,
            wetravel_token_metadata: expect.objectContaining({
                response_source: 'refresh',
                token_type: 'Bearer'
            })
        }));
    });

    it('surfaces an actionable diagnostics message when token exchange fails', async () => {
        const now = Date.now();

        mockIntegrationDataService.getWeTravelCredentials.mockResolvedValue({
            apiKey: 'seed-token-123'
        });

        mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
            wetravel_access_token: 'cached-bearer-token',
            wetravel_access_token_expires_at: new Date(now + 15000),
            wetravel_status: 'connected',
            wetravel_status_error: null,
            wetravel_token_metadata: { cached: true }
        });

        mockAuthService.exchangeBearerToken.mockRejectedValue(new Error('invalid grant'));

        await expect(tokenManager.getAccessToken()).rejects.toThrow('WeTravel bearer token exchange failed: invalid grant');

        expect(mockIntegrationDataService.saveIntegrationConfig).toHaveBeenCalledWith(expect.objectContaining({
            wetravel_status: 'exchange_failed',
            wetravel_status_error: 'WeTravel bearer token exchange failed: invalid grant'
        }));
    });
});