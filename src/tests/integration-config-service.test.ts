import { createIntegrationConfigService, IntegrationConfigStore } from '../services/integrations/integration-config-service';

describe('integrationConfigService', () => {
    test('returns the Ventrata webhook secret from the singleton config', async () => {
        const store: jest.Mocked<IntegrationConfigStore> = {
            getSingleton: jest.fn(),
            saveSingleton: jest.fn()
        };

        store.getSingleton.mockResolvedValue({
            id: 'singleton',
            ventrata_webhook_secret: 'secret-123',
            zoho_refresh_token: null,
            access_token: null,
            expires_at: null,
            token_metadata: null,
            wetravel_encrypted_key: null,
            wetravel_org_id: null,
            wetravel_key_iv: null,
            wetravel_key_auth_tag: null,
            wetravel_key_algorithm: null,
            wetravel_access_token: null,
            wetravel_access_token_expires_at: null,
            wetravel_token_metadata: null,
            wetravel_rollout_state: null,
            wetravel_status: null,
            wetravel_status_error: null,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: new Date('2026-01-01T00:00:00.000Z')
        });

        const service = createIntegrationConfigService(store);

        await expect(service.getVentrataWebhookSecret()).resolves.toBe('secret-123');
    });

    test('persists integration config updates through the singleton store', async () => {
        const store: jest.Mocked<IntegrationConfigStore> = {
            getSingleton: jest.fn(),
            saveSingleton: jest.fn()
        };

        store.saveSingleton.mockResolvedValue({
            id: 'singleton',
            ventrata_webhook_secret: 'updated-secret',
            zoho_refresh_token: 'refresh-token',
            access_token: 'access-token',
            expires_at: null,
            token_metadata: { issued_by: 'test' },
            wetravel_encrypted_key: null,
            wetravel_org_id: null,
            wetravel_key_iv: null,
            wetravel_key_auth_tag: null,
            wetravel_key_algorithm: null,
            wetravel_access_token: 'wetravel-access-token',
            wetravel_access_token_expires_at: new Date('2026-01-02T01:00:00.000Z'),
            wetravel_token_metadata: { token_type: 'Bearer' },
            wetravel_rollout_state: null,
            wetravel_status: 'connected',
            wetravel_status_error: null,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: new Date('2026-01-02T00:00:00.000Z')
        });

        const service = createIntegrationConfigService(store);

        await service.saveIntegrationConfig({
            ventrata_webhook_secret: 'updated-secret',
            zoho_refresh_token: 'refresh-token',
            access_token: 'access-token',
            token_metadata: { issued_by: 'test' },
            wetravel_access_token: 'wetravel-access-token',
            wetravel_access_token_expires_at: new Date('2026-01-02T01:00:00.000Z'),
            wetravel_token_metadata: { token_type: 'Bearer' },
            wetravel_rollout_state: null,
            wetravel_status: 'connected'
        });

        expect(store.saveSingleton).toHaveBeenCalledWith({
            ventrata_webhook_secret: 'updated-secret',
            zoho_refresh_token: 'refresh-token',
            access_token: 'access-token',
            token_metadata: { issued_by: 'test' },
            wetravel_access_token: 'wetravel-access-token',
            wetravel_access_token_expires_at: new Date('2026-01-02T01:00:00.000Z'),
            wetravel_token_metadata: { token_type: 'Bearer' },
            wetravel_rollout_state: null,
            wetravel_status: 'connected'
        });
    });

    test('returns a default-enabled rollout guard and respects saved disabled state', async () => {
        const store: jest.Mocked<IntegrationConfigStore> = {
            getSingleton: jest.fn(),
            saveSingleton: jest.fn()
        };

        store.getSingleton
            .mockResolvedValueOnce({
                id: 'singleton',
                ventrata_webhook_secret: null,
                zoho_refresh_token: null,
                access_token: null,
                expires_at: null,
                token_metadata: null,
                wetravel_encrypted_key: null,
                wetravel_org_id: null,
                wetravel_key_iv: null,
                wetravel_key_auth_tag: null,
                wetravel_key_algorithm: null,
                wetravel_access_token: null,
                wetravel_access_token_expires_at: null,
                wetravel_token_metadata: null,
                wetravel_rollout_state: null,
                wetravel_status: null,
                wetravel_status_error: null,
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                updated_at: new Date('2026-01-01T00:00:00.000Z')
            })
            .mockResolvedValueOnce({
                id: 'singleton',
                ventrata_webhook_secret: null,
                zoho_refresh_token: null,
                access_token: null,
                expires_at: null,
                token_metadata: null,
                wetravel_encrypted_key: null,
                wetravel_org_id: null,
                wetravel_key_iv: null,
                wetravel_key_auth_tag: null,
                wetravel_key_algorithm: null,
                wetravel_access_token: null,
                wetravel_access_token_expires_at: null,
                wetravel_token_metadata: null,
                wetravel_rollout_state: 'disabled',
                wetravel_status: null,
                wetravel_status_error: null,
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                updated_at: new Date('2026-01-01T00:00:00.000Z')
            });

        const service = createIntegrationConfigService(store);

        await expect(service.getWeTravelRolloutGuard()).resolves.toEqual({
            state: 'enabled',
            enabled: true,
            canProcess: true,
            source: 'default'
        });

        await expect(service.getWeTravelRolloutGuard()).resolves.toEqual({
            state: 'disabled',
            enabled: false,
            canProcess: false,
            source: 'configured'
        });
    });
});