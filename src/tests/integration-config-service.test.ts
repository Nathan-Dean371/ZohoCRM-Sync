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
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: new Date('2026-01-02T00:00:00.000Z')
        });

        const service = createIntegrationConfigService(store);

        await service.saveIntegrationConfig({
            ventrata_webhook_secret: 'updated-secret',
            zoho_refresh_token: 'refresh-token',
            access_token: 'access-token',
            token_metadata: { issued_by: 'test' }
        });

        expect(store.saveSingleton).toHaveBeenCalledWith({
            ventrata_webhook_secret: 'updated-secret',
            zoho_refresh_token: 'refresh-token',
            access_token: 'access-token',
            token_metadata: { issued_by: 'test' }
        });
    });
});