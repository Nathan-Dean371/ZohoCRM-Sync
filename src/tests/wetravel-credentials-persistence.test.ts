import { createIntegrationDataService, IntegrationDataStore } from '../services/integrations/integration-config-service';
import prisma from '../services/database/databaseConnector';

describe('WeTravel Credential Persistence - Slice 1', () => {
    const testApiKey = 'wetravel_key_test_12345';
    const testOrgId = 'org_67890';

    beforeAll(async () => {
        // Clear integration config before tests
        await prisma.integrationConfig.deleteMany({});
        // Create default singleton entry
        await prisma.integrationConfig.create({
            data: {
                id: 'singleton',
                ventrata_webhook_secret: null,
                zoho_refresh_token: null,
                access_token: null,
                expires_at: null,
                wetravel_encrypted_key: null,
                wetravel_org_id: null,
                wetravel_key_iv: null,
                wetravel_key_auth_tag: null,
                wetravel_key_algorithm: null,
                wetravel_status: null,
                wetravel_status_error: null
            }
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.integrationConfig.deleteMany({});
    });

    test('Admin can save and retrieve WeTravel credentials', async () => {
        // Create a real integration data store using Prisma
        const store: IntegrationDataStore = {
            getSingleton: async () => {
                const config = await prisma.integrationConfig.findUnique({
                    where: { id: 'singleton' }
                });
                return config as any;
            },
            saveSingleton: async (input: any) => {
                const updated = await prisma.integrationConfig.update({
                    where: { id: 'singleton' },
                    data: input
                });
                return updated as any;
            },
            createWebhookLog: async (input: any) => {
                const log = await prisma.webhookLog.create({ data: input });
                return log as any;
            },
            updateWebhookLog: async (id: string, input: any) => {
                const log = await prisma.webhookLog.update({ where: { id }, data: input });
                return log as any;
            },
            getWebhookLog: async (id: string) => {
                const log = await prisma.webhookLog.findUnique({ where: { id } });
                return log as any;
            },
            listWebhookLogs: async (options: any) => {
                const logs = await prisma.webhookLog.findMany(options);
                return logs as any;
            },
            upsertIdempotencyMap: async (input: any) => {
                const map = await prisma.idempotencyMap.upsert({
                    where: { ventrata_uuid: input.ventrata_uuid },
                    create: input,
                    update: input
                });
                return map as any;
            },
            getIdempotencyMap: async (ventrataUuid: string) => {
                const map = await prisma.idempotencyMap.findUnique({
                    where: { ventrata_uuid: ventrataUuid }
                });
                return map as any;
            }
        };

        const service = createIntegrationDataService(store);

        // ACT: Save credentials with initial status
        await service.saveWeTravelCredentials(
            { apiKey: testApiKey, orgId: testOrgId },
            'pending_validation'
        );

        // ASSERT: Credentials are saved and retrievable
        const retrieved = await service.getWeTravelCredentials();
        expect(retrieved).not.toBeNull();
        expect(retrieved?.apiKey).toBe(testApiKey);
        expect(retrieved?.orgId).toBe(testOrgId);

        // ASSERT: Status is retrievable
        const status = await service.getWeTravelStatus();
        expect(status.status).toBe('pending_validation');
        expect(status.error).toBeNull();
    });

    test('Admin can update credentials without creating duplicates', async () => {
        const store: IntegrationDataStore = {
            getSingleton: async () => {
                const config = await prisma.integrationConfig.findUnique({
                    where: { id: 'singleton' }
                });
                return config as any;
            },
            saveSingleton: async (input: any) => {
                const updated = await prisma.integrationConfig.update({
                    where: { id: 'singleton' },
                    data: input
                });
                return updated as any;
            },
            createWebhookLog: async (input: any) => {
                const log = await prisma.webhookLog.create({ data: input });
                return log as any;
            },
            updateWebhookLog: async (id: string, input: any) => {
                const log = await prisma.webhookLog.update({ where: { id }, data: input });
                return log as any;
            },
            getWebhookLog: async (id: string) => {
                const log = await prisma.webhookLog.findUnique({ where: { id } });
                return log as any;
            },
            listWebhookLogs: async (options: any) => {
                const logs = await prisma.webhookLog.findMany(options);
                return logs as any;
            },
            upsertIdempotencyMap: async (input: any) => {
                const map = await prisma.idempotencyMap.upsert({
                    where: { ventrata_uuid: input.ventrata_uuid },
                    create: input,
                    update: input
                });
                return map as any;
            },
            getIdempotencyMap: async (ventrataUuid: string) => {
                const map = await prisma.idempotencyMap.findUnique({
                    where: { ventrata_uuid: ventrataUuid }
                });
                return map as any;
            }
        };

        const service = createIntegrationDataService(store);

        // ACT: Save initial credentials
        await service.saveWeTravelCredentials(
            { apiKey: testApiKey, orgId: testOrgId },
            'connected'
        );

        // ACT: Save again with different status
        const updatedKey = 'wetravel_key_updated_99999';
        await service.saveWeTravelCredentials(
            { apiKey: updatedKey, orgId: testOrgId },
            'connected'
        );

        // ASSERT: Only the new credentials are stored (idempotent update)
        const retrieved = await service.getWeTravelCredentials();
        expect(retrieved?.apiKey).toBe(updatedKey);

        // ASSERT: Only one config record exists
        const configs = await prisma.integrationConfig.findMany();
        expect(configs).toHaveLength(1);
        expect(configs[0].id).toBe('singleton');
    });

    test('Returns null when credentials are not saved', async () => {
        // Clear credentials
        await prisma.integrationConfig.update({
            where: { id: 'singleton' },
            data: {
                wetravel_encrypted_key: null,
                wetravel_org_id: null,
                wetravel_key_iv: null,
                wetravel_key_auth_tag: null
            }
        });

        const store: IntegrationDataStore = {
            getSingleton: async () => {
                const config = await prisma.integrationConfig.findUnique({
                    where: { id: 'singleton' }
                });
                return config as any;
            },
            saveSingleton: async (input: any) => {
                const updated = await prisma.integrationConfig.update({
                    where: { id: 'singleton' },
                    data: input
                });
                return updated as any;
            },
            createWebhookLog: async (input: any) => {
                const log = await prisma.webhookLog.create({ data: input });
                return log as any;
            },
            updateWebhookLog: async (id: string, input: any) => {
                const log = await prisma.webhookLog.update({ where: { id }, data: input });
                return log as any;
            },
            getWebhookLog: async (id: string) => {
                const log = await prisma.webhookLog.findUnique({ where: { id } });
                return log as any;
            },
            listWebhookLogs: async (options: any) => {
                const logs = await prisma.webhookLog.findMany(options);
                return logs as any;
            },
            upsertIdempotencyMap: async (input: any) => {
                const map = await prisma.idempotencyMap.upsert({
                    where: { ventrata_uuid: input.ventrata_uuid },
                    create: input,
                    update: input
                });
                return map as any;
            },
            getIdempotencyMap: async (ventrataUuid: string) => {
                const map = await prisma.idempotencyMap.findUnique({
                    where: { ventrata_uuid: ventrataUuid }
                });
                return map as any;
            }
        };

        const service = createIntegrationDataService(store);

        const retrieved = await service.getWeTravelCredentials();
        expect(retrieved).toBeNull();
    });
});
