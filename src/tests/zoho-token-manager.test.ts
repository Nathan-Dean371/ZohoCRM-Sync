import { ZohoTokenManager } from '../services/zoho/zoho-token-manager';
import ZohoAuthService from '../services/zoho/zoho-auth';
import { IntegrationDataService } from '../services/integrations/integration-config-service';

describe('ZohoTokenManager', () => {
    let tokenManager: ZohoTokenManager;
    let mockIntegrationDataService: jest.Mocked<any>;
    let mockZohoAuthService: jest.Mocked<any>;

    beforeEach(() => {
        mockIntegrationDataService = {
            getIntegrationConfig: jest.fn(),
            saveIntegrationConfig: jest.fn(),
        };
        mockZohoAuthService = {
            getAccessToken: jest.fn(),
            exchangeCodeForTokens: jest.fn(),
            refreshAccessToken: jest.fn(),
        };
        tokenManager = new ZohoTokenManager(
            mockIntegrationDataService as any,
            mockZohoAuthService as any
        );
    });

    describe('getAccessToken', () => {
        it('should return cached token from DB if it is valid', async () => {
            const now = new Date();
            const future = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now
            
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'valid_token',
                expires_at: future,
                zoho_refresh_token: 'refresh_token'
            });

            const token = await tokenManager.getAccessToken();

            expect(token).toBe('valid_token');
            expect(mockZohoAuthService.getAccessToken).not.toHaveBeenCalled();
            expect(mockIntegrationDataService.saveIntegrationConfig).not.toHaveBeenCalled();
        });

        it('should refresh token if expired and save to DB', async () => {
            const now = new Date();
            const past = new Date(now.getTime() - 1000 * 60); // 1 minute ago
            const futureDate = new Date(now.getTime() + 3600 * 1000);
            
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'expired_token',
                expires_at: past,
                zoho_refresh_token: 'refresh_token'
            });

            mockZohoAuthService.refreshAccessToken.mockResolvedValue({
                access_token: 'new_token',
                expires_in: 3600,
                expires_at: futureDate.getTime(),
                api_domain: 'https://www.zohoapis.com',
                token_type: 'Bearer'
            });

            const token = await tokenManager.getAccessToken();

            expect(token).toBe('new_token');
            expect(mockZohoAuthService.refreshAccessToken).toHaveBeenCalledWith('refresh_token');
            expect(mockIntegrationDataService.saveIntegrationConfig).toHaveBeenCalledWith(expect.objectContaining({
                access_token: 'new_token',
                expires_at: expect.any(Date)
            }));
        });

        it('should update refresh token if a new one is returned', async () => {
            const now = new Date();
            const past = new Date(now.getTime() - 1000 * 60);
            
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'expired_token',
                expires_at: past,
                zoho_refresh_token: 'old_refresh_token'
            });

            mockZohoAuthService.refreshAccessToken.mockResolvedValue({
                access_token: 'new_token',
                refresh_token: 'new_refresh_token',
                expires_in: 3600,
                expires_at: Date.now() + 3600 * 1000,
                api_domain: 'https://www.zohoapis.com',
                token_type: 'Bearer'
            });

            await tokenManager.getAccessToken();

            expect(mockIntegrationDataService.saveIntegrationConfig).toHaveBeenCalledWith(expect.objectContaining({
                access_token: 'new_token',
                zoho_refresh_token: 'new_refresh_token'
            }));
        });

        it('should throw error if no refresh token is available', async () => {
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                zoho_refresh_token: null
            });

            await expect(tokenManager.getAccessToken()).rejects.toThrow('Zoho refresh token is missing');
        });

        it('should only refresh once if multiple calls are made simultaneously', async () => {
            const now = new Date();
            const past = new Date(now.getTime() - 1000 * 60);
            
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'expired_token',
                expires_at: past,
                zoho_refresh_token: 'refresh_token'
            });

            // Make refreshAccessToken take some time
            mockZohoAuthService.refreshAccessToken.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return {
                    access_token: 'new_token',
                    expires_in: 3600,
                    expires_at: Date.now() + 3600 * 1000,
                    api_domain: 'https://www.zohoapis.com',
                    token_type: 'Bearer'
                };
            });

            const results = await Promise.all([
                tokenManager.getAccessToken(),
                tokenManager.getAccessToken(),
                tokenManager.getAccessToken()
            ]);

            expect(results).toEqual(['new_token', 'new_token', 'new_token']);
            expect(mockZohoAuthService.refreshAccessToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('withZohoToken', () => {
        it('should execute provided function with access token', async () => {
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'valid_token',
                expires_at: new Date(Date.now() + 3600 * 1000),
                zoho_refresh_token: 'refresh_token'
            });

            const result = await tokenManager.withZohoToken(async (token) => {
                return `result with ${token}`;
            });

            expect(result).toBe('result with valid_token');
        });

        it('should handle 429 errors with retry and backoff', async () => {
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'valid_token',
                expires_at: new Date(Date.now() + 3600 * 1000),
                zoho_refresh_token: 'refresh_token'
            });

            const task = jest.fn()
                .mockRejectedValueOnce({ response: { status: 429 } })
                .mockResolvedValueOnce('success after retry');

            // We need to use a shorter backoff for tests or mock the timer
            const result = await tokenManager.withZohoToken(task, { maxRetries: 1, initialDelay: 10 });

            expect(result).toBe('success after retry');
            expect(task).toHaveBeenCalledTimes(2);
        });

        it('should handle 5xx errors with retry and backoff', async () => {
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'valid_token',
                expires_at: new Date(Date.now() + 3600 * 1000),
                zoho_refresh_token: 'refresh_token'
            });

            const task = jest.fn()
                .mockRejectedValueOnce({ response: { status: 503 } })
                .mockResolvedValueOnce('success after retry');

            const result = await tokenManager.withZohoToken(task, { maxRetries: 1, initialDelay: 10 });

            expect(result).toBe('success after retry');
            expect(task).toHaveBeenCalledTimes(2);
        });

        it('should limit concurrency', async () => {
            mockIntegrationDataService.getIntegrationConfig.mockResolvedValue({
                access_token: 'valid_token',
                expires_at: new Date(Date.now() + 3600 * 1000),
                zoho_refresh_token: 'refresh_token'
            });

            tokenManager = new ZohoTokenManager(
                mockIntegrationDataService as any,
                mockZohoAuthService as any,
                { maxConcurrency: 2 }
            );

            let activeCount = 0;
            let maxObservedConcurrency = 0;

            const task = async () => {
                activeCount++;
                maxObservedConcurrency = Math.max(maxObservedConcurrency, activeCount);
                await new Promise(resolve => setTimeout(resolve, 50));
                activeCount--;
                return 'done';
            };

            await Promise.all([
                tokenManager.withZohoToken(task),
                tokenManager.withZohoToken(task),
                tokenManager.withZohoToken(task),
                tokenManager.withZohoToken(task)
            ]);

            expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
        });
    });
});
