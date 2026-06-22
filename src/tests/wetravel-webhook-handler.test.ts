import WeTravelWebhookHandler from '../services/wetravel/wetravel-webhook-handler';

describe('WeTravelWebhookHandler', () => {
    it('skips duplicate CRM work when the same booking is replayed', async () => {
        const idService = {
            getZohoId: jest.fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce('zoho-booking-789'),
            saveMapping: jest.fn().mockResolvedValue(undefined)
        };

        const zohoService = {
            upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-123' }),
            upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-789' })
        };

        const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

        const event = {
            booking: {
                uuid: 'wt-booking-123',
                contact: {
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    email: 'ada@example.com'
                },
                productName: 'Summer Tour',
                utcConfirmedAt: '2026-06-16T12:00:00.000Z',
                confirmedAt: '2026-06-16T12:00:00.000Z',
                status: 'CONFIRMED'
            }
        };

        await handler.handleWebhook(event);
        await handler.handleWebhook(event);

        expect(idService.getZohoId).toHaveBeenCalledWith('wt-booking-123');
        expect(zohoService.upsertContact).toHaveBeenCalledTimes(1);
        expect(zohoService.upsertBooking).toHaveBeenCalledTimes(1);
        expect(idService.saveMapping).toHaveBeenCalledTimes(1);
    });
});