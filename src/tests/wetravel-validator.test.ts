import { WeTravelValidator, WeTravelValidationResult } from '../services/integrations/wetravel-validator';

describe('WeTravel Validator - Slice 2', () => {
    let validator: WeTravelValidator;

    beforeEach(() => {
        // Mock fetch for testing
        global.fetch = jest.fn();
        validator = new WeTravelValidator('https://api.wetravel.test');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('Rejects invalid API key format', async () => {
        const result = await validator.validateCredentials('', 'org_123');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('invalid_key');
        expect(result.errorMessage).toContain('API key is required');
    });

    test('Returns invalid_key when API key fails authentication (401)', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            status: 401,
            ok: false
        });

        const result = await validator.validateCredentials('invalid_key_123456');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('invalid_key');
        expect(result.errorMessage).toContain('API key is invalid or expired');
    });

    test('Returns no_pro when account lacks WeTravel Pro', async () => {
        // First call (auth exchange) succeeds
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 201,
                ok: true,
                json: async () => ({ access_token: 'access-token-123' })
            })
            // Second call (resource access) returns success
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            });

        const result = await validator.validateCredentials('valid_key_123456');

        expect(result.isValid).toBe(true);
        expect(result.status).toBe('connected');
    });

    test('Returns not_main_account when using sub-account credentials', async () => {
        // Auth exchange
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 201,
                ok: true,
                json: async () => ({ access_token: 'access-token-123' })
            })
            // Resource access
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            });

        const result = await validator.validateCredentials('valid_key_123456');

        expect(result.isValid).toBe(true);
        expect(result.status).toBe('connected');
    });

    test('Returns permission_denied when lacking integration access', async () => {
        // Auth exchange
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 201,
                ok: true,
                json: async () => ({ access_token: 'access-token-123' })
            })
            // Resource access is denied
            .mockResolvedValueOnce({
                status: 403,
                ok: false
            });

        const result = await validator.validateCredentials('valid_key_123456');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('permission_denied');
        expect(result.errorMessage).toContain('does not have permission');
    });

    test('Returns connected when all validations pass', async () => {
        // Auth exchange
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 201,
                ok: true,
                json: async () => ({ access_token: 'access-token-123' })
            })
            // Resource access
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            });

        const result = await validator.validateCredentials('valid_key_123456');

        expect(result.isValid).toBe(true);
        expect(result.status).toBe('connected');
        expect(result.errorMessage).toBeUndefined();
    });

    test('Uses v2 resource endpoints without requiring organization ID', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 201,
                ok: true,
                json: async () => ({ access_token: 'access-token-123' })
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            });

        await validator.validateCredentials('valid_key_123456');

        expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://api.wetravel.test/v2/auth/tokens/access', expect.any(Object));
        expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://api.wetravel.test/v2/payment_links?per_page=1&page=1&publish_status=published', expect.any(Object));
    });

    test('Defaults to the v2 API root when no base URL is provided', async () => {
        const defaultValidator = new WeTravelValidator();

        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 201,
                ok: true,
                json: async () => ({ access_token: 'access-token-123' })
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
            });

        await defaultValidator.validateCredentials('valid_key_123456');

        expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://api.wetravel.com/v2/auth/tokens/access', expect.any(Object));
        expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://api.wetravel.com/v2/payment_links?per_page=1&page=1&publish_status=published', expect.any(Object));
    });

    test('Stops at first validation failure (fail-fast)', async () => {
        // Only mock response for connectivity check (will fail 401)
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            status: 401,
            ok: false
        });

        const result = await validator.validateCredentials('invalid_key_123456');

        // Should stop at connectivity check and not call other endpoints
        expect(result.status).toBe('invalid_key');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
