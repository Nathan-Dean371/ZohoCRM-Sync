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

    test('Rejects missing organization ID', async () => {
        const result = await validator.validateCredentials('valid_key_123456', '');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('invalid_key');
        expect(result.errorMessage).toContain('Organization ID is required');
    });

    test('Returns invalid_key when API key fails authentication (401)', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            status: 401,
            ok: false
        });

        const result = await validator.validateCredentials('invalid_key_123456', 'org_123');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('invalid_key');
        expect(result.errorMessage).toContain('API key is invalid or expired');
    });

    test('Returns no_pro when account lacks WeTravel Pro', async () => {
        // First call (connectivity check) succeeds
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            })
            // Second call (plan check) returns non-pro plan
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ plan: 'starter' })
            });

        const result = await validator.validateCredentials('valid_key_123456', 'org_123');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('no_pro');
        expect(result.errorMessage).toContain('does not have Pro plan');
    });

    test('Returns not_main_account when using sub-account credentials', async () => {
        // Connectivity check
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            })
            // Plan check (passes - is pro)
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ plan: 'pro' })
            })
            // Main account check (fails - is sub-account)
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ isSubAccount: true })
            });

        const result = await validator.validateCredentials('valid_key_123456', 'org_123');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('not_main_account');
        expect(result.errorMessage).toContain('sub-account');
    });

    test('Returns permission_denied when lacking integration access', async () => {
        // Connectivity check
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            })
            // Plan check (passes)
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ plan: 'pro' })
            })
            // Main account check (passes)
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ isSubAccount: false })
            })
            // Permissions check (403)
            .mockResolvedValueOnce({
                status: 403,
                ok: false
            });

        const result = await validator.validateCredentials('valid_key_123456', 'org_123');

        expect(result.isValid).toBe(false);
        expect(result.status).toBe('permission_denied');
        expect(result.errorMessage).toContain('does not have permission');
    });

    test('Returns connected when all validations pass', async () => {
        // Connectivity check
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            })
            // Plan check
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ plan: 'pro' })
            })
            // Main account check
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ isSubAccount: false })
            })
            // Permissions check
            .mockResolvedValueOnce({
                status: 200,
                ok: true
            });

        const result = await validator.validateCredentials('valid_key_123456', 'org_123');

        expect(result.isValid).toBe(true);
        expect(result.status).toBe('connected');
        expect(result.errorMessage).toBeUndefined();
    });

    test('Stops at first validation failure (fail-fast)', async () => {
        // Only mock response for connectivity check (will fail 401)
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            status: 401,
            ok: false
        });

        const result = await validator.validateCredentials('invalid_key_123456', 'org_123');

        // Should stop at connectivity check and not call other endpoints
        expect(result.status).toBe('invalid_key');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
