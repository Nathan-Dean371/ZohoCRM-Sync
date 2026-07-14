import prisma from './databaseConnector';

export class IdempotencyService {
    /**
     * Gets the Zoho ID for a given external booking ID (Ventrata UUID or WeTravel reference)
     * @param externalBookingId - The external booking ID
     * @param sourceType - The source system (e.g., 'ventrata', 'wetravel')
     */
    async getZohoId(externalBookingId: string, sourceType: string = 'ventrata'): Promise<string | null> {
        try {
            const mapping = await prisma.idempotencyMap.findFirst({
                where: {
                    source_id: externalBookingId,
                    source_type: sourceType,
                    record_type: 'booking'
                }
            });
            return mapping?.zoho_record_id || null;
        } catch (error) {
            console.error('Error fetching idempotency mapping:', error);
            return null;
        }
    }

    /**
     * Saves a mapping between an external booking ID and a Zoho Record ID
     * @param externalBookingId - Ventrata UUID or WeTravel booking reference
     * @param zohoId - Zoho CRM record ID
     * @param sourceType - The source system (e.g., 'ventrata', 'wetravel')
     */
    async saveMapping(externalBookingId: string, zohoId: string, sourceType: string = 'ventrata'): Promise<void> {
        try {
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
                        zoho_record_id: zohoId
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
