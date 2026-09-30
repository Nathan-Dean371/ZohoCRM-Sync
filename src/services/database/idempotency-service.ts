import prisma from './databaseConnector';

export class IdempotencyService {
    /**
     * Gets the full idempotency mapping record for a given external booking ID
     */
    async getMapping(externalBookingId: string, sourceType: string = 'ventrata') {
        try {
            return await prisma.idempotencyMap.findFirst({
                where: {
                    source_id: externalBookingId,
                    source_type: sourceType,
                    record_type: 'booking'
                }
            });
        } catch (error) {
            console.error('Error fetching idempotency mapping:', error);
            return null;
        }
    }

    /**
     * Gets the Zoho ID for a given external booking ID (Ventrata UUID or WeTravel reference)
     * @param externalBookingId - The external booking ID
     * @param sourceType - The source system (e.g., 'ventrata', 'wetravel')
     */
    async getZohoId(externalBookingId: string, sourceType: string = 'ventrata'): Promise<string | null> {
        const mapping = await this.getMapping(externalBookingId, sourceType);
        return mapping?.zoho_record_id || null;
    }

    /**
     * Checks if incoming payload timestamp is stale compared to persisted source_updated_at
     */
    async isStale(externalBookingId: string, sourceType: string = 'ventrata', incomingUpdatedAt?: Date | string | null): Promise<boolean> {
        if (!incomingUpdatedAt) return false;
        const mapping = await this.getMapping(externalBookingId, sourceType);
        if (!mapping?.source_updated_at) return false;

        const incomingTime = new Date(incomingUpdatedAt).getTime();
        const existingTime = new Date(mapping.source_updated_at).getTime();
        if (isNaN(incomingTime) || isNaN(existingTime)) return false;

        return incomingTime <= existingTime;
    }

    /**
     * Saves a mapping between an external booking ID and a Zoho Record ID
     * @param externalBookingId - Ventrata UUID or WeTravel booking reference
     * @param zohoId - Zoho CRM record ID
     * @param sourceType - The source system (e.g., 'ventrata', 'wetravel')
     * @param sourceUpdatedAt - The source timestamp when the record was updated in Ventrata/WeTravel
     */
    async saveMapping(
        externalBookingId: string, 
        zohoId: string, 
        sourceType: string = 'ventrata',
        sourceUpdatedAt?: Date | string | null
    ): Promise<void> {
        try {
            const parsedUpdatedAt = sourceUpdatedAt ? new Date(sourceUpdatedAt) : null;
            const validUpdatedAt = parsedUpdatedAt && !isNaN(parsedUpdatedAt.getTime()) ? parsedUpdatedAt : null;

            // First check if it exists
            const existing = await prisma.idempotencyMap.findFirst({
                where: {
                    source_id: externalBookingId,
                    source_type: sourceType
                }
            });

            if (existing) {
                // Update existing record
                await prisma.idempotencyMap.updateMany({
                    where: {
                        source_id: externalBookingId,
                        source_type: sourceType
                    },
                    data: {
                        zoho_record_id: zohoId,
                        source_updated_at: validUpdatedAt || existing.source_updated_at,
                        updated_at: new Date()
                    }
                });
            } else {
                // Create new record
                await prisma.idempotencyMap.create({
                    data: {
                        source_id: externalBookingId,
                        source_type: sourceType,
                        record_type: 'booking',
                        zoho_record_id: zohoId,
                        source_updated_at: validUpdatedAt
                    }
                });
            }
        } catch (error) {
            console.error('Error saving idempotency mapping:', error);
            // We don't necessarily want to crash the worker if DB save fails, 
            // but we should log it.
        }
    }
}

export const idempotencyService = new IdempotencyService();
