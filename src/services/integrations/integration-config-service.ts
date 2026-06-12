import prismaClientInstance from '../database/databaseConnector';

export interface IntegrationConfigRecord {
    id: string;
    ventrata_webhook_secret: string | null;
    zoho_refresh_token: string | null;
    access_token: string | null;
    expires_at: Date | null;
    token_metadata: unknown | null;
    created_at: Date;
    updated_at: Date;
}

export interface IntegrationConfigInput {
    ventrata_webhook_secret?: string | null;
    zoho_refresh_token?: string | null;
    access_token?: string | null;
    expires_at?: Date | null;
    token_metadata?: unknown | null;
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
    upsertIdempotencyMap(input: IdempotencyMapInput): Promise<IdempotencyMapRecord>;
    getIdempotencyMap(ventrataUuid: string): Promise<IdempotencyMapRecord | null>;
}

export function createIntegrationConfigService(store: IntegrationConfigStore) {
    return {
        getIntegrationConfig: () => store.getSingleton(),
        saveIntegrationConfig: (input: IntegrationConfigInput) => store.saveSingleton(input),
        getVentrataWebhookSecret: async () => {
            const integrationConfig = await store.getSingleton();

            return integrationConfig?.ventrata_webhook_secret ?? null;
        }
    };
}

export type IntegrationDataService = ReturnType<typeof createIntegrationDataService>;

export function createIntegrationDataService(store: IntegrationDataStore) {
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
        createWebhookLog: (input: WebhookLogInput) => store.createWebhookLog(input),
        updateWebhookLog: (id: string, input: Partial<WebhookLogInput>) => store.updateWebhookLog(id, input),
        getWebhookLog: (id: string) => store.getWebhookLog(id),
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
                    created_at: new Date(),
                    updated_at: input.updated_at ?? new Date()
                },
                update: {
                    ventrata_webhook_secret: input.ventrata_webhook_secret ?? existingConfig?.ventrata_webhook_secret ?? null,
                    zoho_refresh_token: input.zoho_refresh_token ?? existingConfig?.zoho_refresh_token ?? null,
                    access_token: input.access_token ?? existingConfig?.access_token ?? null,
                    expires_at: input.expires_at ?? existingConfig?.expires_at ?? null,
                    token_metadata: input.token_metadata ?? existingConfig?.token_metadata ?? null,
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