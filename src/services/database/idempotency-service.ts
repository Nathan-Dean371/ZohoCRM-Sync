import prisma from './databaseConnector';

export class IdempotencyService {
    /**
     * Gets the Zoho ID for a given Ventrata UUID if it exists
     */
    async getZohoId(ventrataUuid: string): Promise<string | null> {
        try {
            const mapping = await prisma.idempotencyMap.findUnique({
                where: {
                    ventrata_uuid: ventrataUuid
                }
            });
            return mapping?.zoho_record_id || null;
        } catch (error) {
            console.error('Error fetching idempotency mapping:', error);
            return null;
        }
    }

    /**
     * Saves a mapping between a Ventrata UUID and a Zoho Record ID
     */
    async saveMapping(ventrataUuid: string, zohoId: string): Promise<void> {
        try {
            await prisma.idempotencyMap.upsert({
                where: {
                    ventrata_uuid: ventrataUuid
                },
                update: {
                    zoho_record_id: zohoId,
                    updated_at: new Date()
                },
                create: {
                    ventrata_uuid: ventrataUuid,
                    zoho_record_id: zohoId
                }
            });
        } catch (error) {
            console.error('Error saving idempotency mapping:', error);
            // We don't necessarily want to crash the worker if DB save fails, 
            // but we should log it.
        }
    }
}

export const idempotencyService = new IdempotencyService();
