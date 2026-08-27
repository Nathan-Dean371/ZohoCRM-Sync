import { WeTravelAuthService } from '../services/integrations/wetravel-auth';

describe('WeTravelAuthService', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('derives the default v2 access-token endpoint from a v2 base URL', async () => {
        const authService = new WeTravelAuthService({ apiBaseUrl: 'https://api.wetravel.com/v2' });

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                access_token: 'bearer-token',
                expires_in: 3600,
                token_type: 'Bearer'
            })
        });

        await authService.exchangeBearerToken('seed-token-123');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.wetravel.com/v2/auth/tokens/access',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer seed-token-123'
                })
            })
        );
    });

    it('honors an explicit token URL override', async () => {
        const authService = new WeTravelAuthService({
            apiBaseUrl: 'https://api.wetravel.com/v2',
            tokenEndpoint: 'https://auth.example.test/token'
        });

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                access_token: 'bearer-token',
                expires_in: 3600
            })
        });

        await authService.exchangeBearerToken('seed-token-123');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://auth.example.test/token',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer seed-token-123'
                })
            })
        );
    });

    it('rewrites legacy oauth/token overrides to the current v2 access-token endpoint', async () => {
        process.env.WETRAVEL_TOKEN_URL = 'https://api.wetravel.com/oauth/token';

        const authService = new WeTravelAuthService();

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                access_token: 'bearer-token',
                expires_in: 3600,
                token_type: 'Bearer'
            })
        });

        await authService.exchangeBearerToken('seed-token-123');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.wetravel.com/v2/auth/tokens/access',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer seed-token-123'
                })
            })
        );

        delete process.env.WETRAVEL_TOKEN_URL;
    });
});