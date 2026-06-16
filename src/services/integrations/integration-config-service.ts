import prismaClientInstance from '../database/databaseConnector';
import { encryptCredential, decryptCredential, type EncryptedCredential } from './credential-encryption';

export interface WeTravelCredentials {
    apiKey: string; // plaintext input before encryption
    orgId: string;
}

export interface IntegrationConfigRecord {
    id: string;
    ventrata_webhook_secret: string | null;
    zoho_refresh_token: string | null;
    access_token: string | null;
    expires_at: Date | null;
    token_metadata: unknown | null;
    wetravel_encrypted_key: string | null;
    wetravel_org_id: string | null;
    wetravel_key_iv: string | null;
    wetravel_key_auth_tag: string | null;
    wetravel_key_algorithm: string | null;
    wetravel_access_token: string | null;
    wetravel_access_token_expires_at: Date | null;
    wetravel_token_metadata: unknown | null;
    wetravel_status: string | null;
    wetravel_status_error: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface IntegrationConfigInput {
    ventrata_webhook_secret?: string | null;
    zoho_refresh_token?: string | null;
    access_token?: string | null;
    expires_at?: Date | null;
    token_metadata?: unknown | null;
    wetravel_encrypted_key?: string | null;
    wetravel_org_id?: string | null;
    wetravel_key_iv?: string | null;
    wetravel_key_auth_tag?: string | null;
    wetravel_key_algorithm?: string | null;
    wetravel_access_token?: string | null;
    wetravel_access_token_expires_at?: Date | null;
    wetravel_token_metadata?: unknown | null;
    wetravel_status?: string | null;
    wetravel_status_error?: string | null;
    updated_at?: Date;
}

export interface WebhookLogInput {
    payload: unknown;
    status: string;
    attempts?: number;
    last_error?: string | null;
    dlq_ref?: string | null;
    processed_at?: Date | null;
}

export interface WebhookLogRecord extends WebhookLogInput {
    id: string;
    attempts: number;
    created_at: Date;
    processed_at: Date | null;
    last_error: string | null;
    dlq_ref: string | null;
}

export interface IdempotencyMapInput {
    ventrata_uuid: string;
    zoho_record_id: string;
}

export interface IdempotencyMapRecord extends IdempotencyMapInput {
    created_at: Date;
    updated_at: Date;
}

export interface IntegrationConfigStore {
    getSingleton(): Promise<IntegrationConfigRecord | null>;
    saveSingleton(input: IntegrationConfigInput): Promise<IntegrationConfigRecord>;
}

export interface IntegrationDataStore extends IntegrationConfigStore {
    createWebhookLog(input: WebhookLogInput): Promise<WebhookLogRecord>;
    updateWebhookLog(id: string, input: Partial<WebhookLogInput>): Promise<WebhookLogRecord>;
    getWebhookLog(id: string): Promise<WebhookLogRecord | null>;
    listWebhookLogs(options: { where?: any; orderBy?: any; take?: number }): Promise<WebhookLogRecord[]>;
    upsertIdempotencyMap(input: IdempotencyMapInput): Promise<IdempotencyMapRecord>;
    getIdempotencyMap(ventrataUuid: string): Promise<IdempotencyMapRecord | null>;
}

export function createIntegrationConfigService(store: IntegrationConfigStore) {
    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || 'default-dev-key';

    return {
        getIntegrationConfig: () => store.getSingleton(),
        saveIntegrationConfig: (input: IntegrationConfigInput) => store.saveSingleton(input),
        getVentrataWebhookSecret: async () => {
            const integrationConfig = await store.getSingleton();

            return integrationConfig?.ventrata_webhook_secret ?? null;
        },
        // WeTravel credential methods
        getWeTravelCredentials: async (): Promise<WeTravelCredentials | null> => {
            const config = await store.getSingleton();
            if (!config?.wetravel_encrypted_key || !config?.wetravel_org_id) {
                return null;
            }

            try {
                const decrypted = decryptCredential(
                    {
                        encryptedValue: config.wetravel_encrypted_key,
                        iv: config.wetravel_key_iv || '',
                        authTag: config.wetravel_key_auth_tag || '',
                        algorithm: config.wetravel_key_algorithm || 'aes-256-gcm'
                    },
                    encryptionKey
                );

                return {
                    apiKey: decrypted,
                    orgId: config.wetravel_org_id
                };
            } catch (error) {
                console.error('Failed to decrypt WeTravel credentials:', error);
                return null;
            }
        },
        saveWeTravelCredentials: async (credentials: WeTravelCredentials, status: string, statusError?: string) => {
            const encrypted = encryptCredential(credentials.apiKey, encryptionKey);

            return store.saveSingleton({
                wetravel_encrypted_key: encrypted.encryptedValue,
                wetravel_org_id: credentials.orgId,
                wetravel_key_iv: encrypted.iv,
                wetravel_key_auth_tag: encrypted.authTag,
                wetravel_key_algorithm: encrypted.algorithm,
                wetravel_status: status,
                wetravel_status_error: statusError || null
            });
        },
        getWeTravelStatus: async () => {
            const config = await store.getSingleton();
            if (!config) {
                return { status: null, error: null };
            }

            if (config.wetravel_status) {
                return {
                    status: config.wetravel_status,
                    error: config.wetravel_status_error || null
                };
            }

            if (config.wetravel_access_token && config.wetravel_access_token_expires_at) {
                const bufferMs = 60000;

                if (config.wetravel_access_token_expires_at.getTime() <= Date.now() + bufferMs) {
                    return {
                        status: 'token_expiring',
                        error: 'WeTravel bearer token is nearing expiry and will be refreshed before the next call.'
                    };
                }

                return {
                    status: 'connected',
                    error: null
                };
            }

            return {
                status: null,
                error: null
            };
        }
    };
}

export type IntegrationDataService = ReturnType<typeof createIntegrationDataService>;

export function createIntegrationDataService(store: IntegrationDataStore) {
    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || 'default-dev-key';

    return {
        getIntegrationConfig: () => store.getSingleton(),
        saveIntegrationConfig: (input: IntegrationConfigInput) => store.saveSingleton(input),
        getVentrataWebhookSecret: async () => {
            const integrationConfig = await store.getSingleton();

            return integrationConfig?.ventrata_webhook_secret ?? null;
        },
        hasZohoRefreshToken: async () => {
            const integrationConfig = await store.getSingleton();
            return !!integrationConfig?.zoho_refresh_token;
        },
        // WeTravel credential methods
        getWeTravelCredentials: async (): Promise<WeTravelCredentials | null> => {
            const config = await store.getSingleton();
            if (!config?.wetravel_encrypted_key || !config?.wetravel_org_id) {
                return null;
            }

            try {
                const decrypted = decryptCredential(
                    {
                        encryptedValue: config.wetravel_encrypted_key,
                        iv: config.wetravel_key_iv || '',
                        authTag: config.wetravel_key_auth_tag || '',
                        algorithm: config.wetravel_key_algorithm || 'aes-256-gcm'
                    },
                    encryptionKey
                );

                return {
                    apiKey: decrypted,
                    orgId: config.wetravel_org_id
                };
            } catch (error) {
                console.error('Failed to decrypt WeTravel credentials:', error);
                return null;
            }
        },
        saveWeTravelCredentials: async (credentials: WeTravelCredentials, status: string, statusError?: string) => {
            const encrypted = encryptCredential(credentials.apiKey, encryptionKey);

            return store.saveSingleton({
                wetravel_encrypted_key: encrypted.encryptedValue,
                wetravel_org_id: credentials.orgId,
                wetravel_key_iv: encrypted.iv,
                wetravel_key_auth_tag: encrypted.authTag,
                wetravel_key_algorithm: encrypted.algorithm,
                wetravel_status: status,
                wetravel_status_error: statusError || null
            });
        },
        getWeTravelStatus: async () => {
            const config = await store.getSingleton();
            if (!config) {
                return { status: null, error: null };
            }

            if (config.wetravel_status) {
                return {
                    status: config.wetravel_status,
                    error: config.wetravel_status_error || null
                };
            }

            if (config.wetravel_access_token && config.wetravel_access_token_expires_at) {
                const bufferMs = 60000;

                if (config.wetravel_access_token_expires_at.getTime() <= Date.now() + bufferMs) {
                    return {
                        status: 'token_expiring',
                        error: 'WeTravel bearer token is nearing expiry and will be refreshed before the next call.'
                    };
                }

                return {
                    status: 'connected',
                    error: null
                };
            }

            return {
                status: null,
                error: null
            };
        },
        createWebhookLog: (input: WebhookLogInput) => store.createWebhookLog(input),
        updateWebhookLog: (id: string, input: Partial<WebhookLogInput>) => store.updateWebhookLog(id, input),
        getWebhookLog: (id: string) => store.getWebhookLog(id),
        listWebhookLogs: (options: { where?: any; orderBy?: any; take?: number }) => store.listWebhookLogs(options),
        upsertIdempotencyMap: (input: IdempotencyMapInput) => store.upsertIdempotencyMap(input),
        getIdempotencyMap: (ventrataUuid: string) => store.getIdempotencyMap(ventrataUuid)
    };
}

type PrismaLike = {
    integrationConfig: {
        findUnique: (args: { where: { id: string } }) => Promise<IntegrationConfigRecord | null>;
        upsert: (args: {
            where: { id: string };
            create: IntegrationConfigRecord;
            update: IntegrationConfigInput;
        }) => Promise<IntegrationConfigRecord>;
    };
    webhookLog: {
        create: (args: { data: WebhookLogInput }) => Promise<WebhookLogRecord>;
        findUnique: (args: { where: { id: string } }) => Promise<WebhookLogRecord | null>;
        update: (args: { where: { id: string }; data: Partial<WebhookLogInput> }) => Promise<WebhookLogRecord>;
        findMany: (args: { where?: any; orderBy?: any; take?: number }) => Promise<WebhookLogRecord[]>;
    };
    idempotencyMap: {
        findUnique: (args: { where: { ventrata_uuid: string } }) => Promise<IdempotencyMapRecord | null>;
        upsert: (args: {
            where: { ventrata_uuid: string };
            create: IdempotencyMapInput;
            update: IdempotencyMapInput;
        }) => Promise<IdempotencyMapRecord>;
    };
};

const singletonId = 'singleton';

export function createPrismaIntegrationDataStore(prisma: PrismaLike = prismaClientInstance as unknown as PrismaLike): IntegrationDataStore {
    return {
        async getSingleton() {
            return prisma.integrationConfig.findUnique({ where: { id: singletonId } });
        },
        async saveSingleton(input: IntegrationConfigInput) {
            const existingConfig = await prisma.integrationConfig.findUnique({ where: { id: singletonId } });

            return prisma.integrationConfig.upsert({
                where: { id: singletonId },
                create: {
                    id: singletonId,
                    ventrata_webhook_secret: input.ventrata_webhook_secret ?? null,
                    zoho_refresh_token: input.zoho_refresh_token ?? null,
                    access_token: input.access_token ?? null,
                    expires_at: input.expires_at ?? null,
                    token_metadata: input.token_metadata ?? null,
                    wetravel_encrypted_key: input.wetravel_encrypted_key ?? null,
                    wetravel_org_id: input.wetravel_org_id ?? null,
                    wetravel_key_iv: input.wetravel_key_iv ?? null,
                    wetravel_key_auth_tag: input.wetravel_key_auth_tag ?? null,
                    wetravel_key_algorithm: input.wetravel_key_algorithm ?? 'aes-256-gcm',
                    wetravel_access_token: input.wetravel_access_token ?? null,
                    wetravel_access_token_expires_at: input.wetravel_access_token_expires_at ?? null,
                    wetravel_token_metadata: input.wetravel_token_metadata ?? null,
                    wetravel_status: input.wetravel_status ?? null,
                    wetravel_status_error: input.wetravel_status_error ?? null,
                    created_at: new Date(),
                    updated_at: input.updated_at ?? new Date()
                },
                update: {
                    ventrata_webhook_secret: input.ventrata_webhook_secret ?? existingConfig?.ventrata_webhook_secret ?? null,
                    zoho_refresh_token: input.zoho_refresh_token ?? existingConfig?.zoho_refresh_token ?? null,
                    access_token: input.access_token ?? existingConfig?.access_token ?? null,
                    expires_at: input.expires_at ?? existingConfig?.expires_at ?? null,
                    token_metadata: input.token_metadata ?? existingConfig?.token_metadata ?? null,
                    wetravel_encrypted_key: input.wetravel_encrypted_key ?? existingConfig?.wetravel_encrypted_key ?? null,
                    wetravel_org_id: input.wetravel_org_id ?? existingConfig?.wetravel_org_id ?? null,
                    wetravel_key_iv: input.wetravel_key_iv ?? existingConfig?.wetravel_key_iv ?? null,
                    wetravel_key_auth_tag: input.wetravel_key_auth_tag ?? existingConfig?.wetravel_key_auth_tag ?? null,
                    wetravel_key_algorithm: input.wetravel_key_algorithm ?? existingConfig?.wetravel_key_algorithm ?? 'aes-256-gcm',
                    wetravel_access_token: input.wetravel_access_token ?? existingConfig?.wetravel_access_token ?? null,
                    wetravel_access_token_expires_at: input.wetravel_access_token_expires_at ?? existingConfig?.wetravel_access_token_expires_at ?? null,
                    wetravel_token_metadata: input.wetravel_token_metadata ?? existingConfig?.wetravel_token_metadata ?? null,
                    wetravel_status: input.wetravel_status ?? existingConfig?.wetravel_status ?? null,
                    wetravel_status_error: input.wetravel_status_error ?? existingConfig?.wetravel_status_error ?? null,
                    updated_at: input.updated_at ?? new Date()
                }
            });
        },
        async createWebhookLog(input: WebhookLogInput) {
            return prisma.webhookLog.create({
                data: {
                    payload: input.payload,
                    status: input.status,
                    attempts: input.attempts ?? 0,
                    last_error: input.last_error ?? null,
                    dlq_ref: input.dlq_ref ?? null,
                    processed_at: input.processed_at ?? null
                }
            });
        },
        async updateWebhookLog(id: string, input: Partial<WebhookLogInput>) {
            return prisma.webhookLog.update({
                where: { id },
                data: {
                    payload: input.payload,
                    status: input.status,
                    attempts: input.attempts,
                    last_error: input.last_error ?? null,
                    dlq_ref: input.dlq_ref ?? null,
                    processed_at: input.processed_at ?? null
                }
            });
        },
        async getWebhookLog(id: string) {
            return prisma.webhookLog.findUnique({ where: { id } });
        },
        async listWebhookLogs(options: { where?: any; orderBy?: any; take?: number }) {
            return prisma.webhookLog.findMany(options);
        },
        async upsertIdempotencyMap(input: IdempotencyMapInput) {
            return prisma.idempotencyMap.upsert({
                where: { ventrata_uuid: input.ventrata_uuid },
                create: input,
                update: input
            });
        },
        async getIdempotencyMap(ventrataUuid: string) {
            return prisma.idempotencyMap.findUnique({ where: { ventrata_uuid: ventrataUuid } });
        }
    };
}

export const integrationDataService = createIntegrationDataService(createPrismaIntegrationDataStore());
export const integrationConfigService = integrationDataService;