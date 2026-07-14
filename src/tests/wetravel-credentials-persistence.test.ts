import { createIntegrationDataService, IntegrationDataStore } from '../services/integrations/integration-config-service';
import prisma from '../services/database/databaseConnector';
import { Prisma } from '@prisma/client';

describe('WeTravel Credential Persistence - Slice 1', () => {
    const testApiKey = 'wetravel_key_test_12345';
    const longTestApiKey = 'w'.repeat(260);

    beforeAll(async () => {
        await prisma.integrationConfig.deleteMany({});
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
                wetravel_access_token: null,
                wetravel_access_token_expires_at: null,
                wetravel_token_metadata: Prisma.JsonNull,
                wetravel_status: null,
                wetravel_status_error: null
            }
        });
    });

    afterAll(async () => {
        await prisma.integrationConfig.deleteMany({});
    });

    test('Admin can save and retrieve WeTravel credentials', async () => {
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
                    where: {
                        source_id_source_type: {
                            source_id: input.ventrata_uuid,
                            source_type: 'ventrata'
                        }
                    },
                    create: {
                        source_id: input.ventrata_uuid,
                        source_type: 'ventrata',
                        record_type: 'booking',
                        zoho_record_id: input.zoho_record_id
                    },
                    update: {
                        zoho_record_id: input.zoho_record_id
                    }
                });
                return map as any;
            },
            getIdempotencyMap: async (ventrataUuid: string) => {
                const map = await prisma.idempotencyMap.findUnique({
                    where: {
                        source_id_source_type: {
                            source_id: ventrataUuid,
                            source_type: 'ventrata'
                        }
                    }
                });
                return map as any;
            }
        };

        const service = createIntegrationDataService(store);

        await service.saveWeTravelCredentials(
            { apiKey: testApiKey },
            'pending_validation'
        );

        const retrieved = await service.getWeTravelCredentials();
        expect(retrieved).not.toBeNull();
        expect(retrieved?.apiKey).toBe(testApiKey);
        expect(retrieved?.orgId).toBeUndefined();

        const status = await service.getWeTravelStatus();
        expect(status.status).toBe('pending_validation');
        expect(status.error).toBeNull();
    });

    test('Admin can save a long WeTravel API key without truncation', async () => {
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
                    where: {
                        source_id_source_type: {
                            source_id: input.ventrata_uuid,
                            source_type: 'ventrata'
                        }
                    },
                    create: {
                        source_id: input.ventrata_uuid,
                        source_type: 'ventrata',
                        record_type: 'booking',
                        zoho_record_id: input.zoho_record_id
                    },
                    update: {
                        zoho_record_id: input.zoho_record_id
                    }
                });
                return map as any;
            },
            getIdempotencyMap: async (ventrataUuid: string) => {
                const map = await prisma.idempotencyMap.findUnique({
                    where: {
                        source_id_source_type: {
                            source_id: ventrataUuid,
                            source_type: 'ventrata'
                        }
                    }
                });
                return map as any;
            }
        };

        const service = createIntegrationDataService(store);

        await service.saveWeTravelCredentials(
            { apiKey: longTestApiKey },
            'connected'
        );

        const retrieved = await service.getWeTravelCredentials();
        expect(retrieved?.apiKey).toBe(longTestApiKey);
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
                    where: {
                        source_id_source_type: {
                            source_id: input.ventrata_uuid,
                            source_type: 'ventrata'
                        }
                    },
                    create: {
                        source_id: input.ventrata_uuid,
                        source_type: 'ventrata',
                        record_type: 'booking',
                        zoho_record_id: input.zoho_record_id
                    },
                    update: {
                        zoho_record_id: input.zoho_record_id
                    }
                });
                return map as any;
            },
            getIdempotencyMap: async (ventrataUuid: string) => {
                const map = await prisma.idempotencyMap.findUnique({
                    where: {
                        source_id_source_type: {
                            source_id: ventrataUuid,
                            source_type: 'ventrata'
                        }
                    }
                });
                return map as any;
            }
        };

        const service = createIntegrationDataService(store);

        await service.saveWeTravelCredentials(
            { apiKey: testApiKey },
            'connected'
        );

        const updatedKey = 'wetravel_key_updated_99999';
        await service.saveWeTravelCredentials(
            { apiKey: updatedKey },
            'connected'
        );

        const retrieved = await service.getWeTravelCredentials();
        expect(retrieved?.apiKey).toBe(updatedKey);

        const configs = await prisma.integrationConfig.findMany();
        expect(configs).toHaveLength(1);
        expect(configs[0].id).toBe('singleton');
    });

    test('Returns null when credentials are not saved', async () => {
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
                    where: {
                        source_id_source_type: {
                            source_id: input.ventrata_uuid,
                            source_type: 'ventrata'
                        }
                    },
                    create: {
                        source_id: input.ventrata_uuid,
                        source_type: 'ventrata',
                        record_type: 'booking',
                        zoho_record_id: input.zoho_record_id
                    },
                    update: {
                        zoho_record_id: input.zoho_record_id
                    }
                });
                return map as any;
            },
            getIdempotencyMap: async (ventrataUuid: string) => {
                const map = await prisma.idempotencyMap.findUnique({
                    where: {
                        source_id_source_type: {
                            source_id: ventrataUuid,
                            source_type: 'ventrata'
                        }
                    }
                });
                return map as any;
            }
        };

        const service = createIntegrationDataService(store);

        const retrieved = await service.getWeTravelCredentials();
        expect(retrieved).toBeNull();
    });
});
