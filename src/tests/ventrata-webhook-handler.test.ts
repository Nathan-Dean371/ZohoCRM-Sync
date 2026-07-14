import VentrataWebhookHandler from '../services/ventrata/ventrata-webhook-handler';
import { WebhookEvent } from '../types/ventrata';

describe('VentrataWebhookHandler', () => {
    let handler: VentrataWebhookHandler;
    let mockZohoService: any;
    let mockIdService: any;

    const mockEvent: WebhookEvent = {
        webhook: {
            id: 'webhook-123',
            event: 'booking_update',
            url: 'https://example.com'
        },
        booking: {
            uuid: 'booking-uuid-456',
            status: 'CONFIRMED',
            productName: 'Test Tour',
            utcConfirmedAt: '2023-01-01T12:00:00Z',
            contact: {
                fullName: 'John Doe',
                firstName: 'John',
                lastName: 'Doe',
                emailAddress: 'john@example.com',
                phoneNumber: '+1234567890',
                country: 'US'
            },
            product: {
                internalName: 'Internal Tour Name'
            },
            availability: {
                localDateTimeStart: '2023-01-02T10:00:00'
            },
            supplierReference: 'SUP-123'
        }
    } as any;

    beforeEach(() => {
        mockZohoService = {
            upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-123', Email: 'john@example.com' }),
            upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-789', Booking_Ref: 'booking-uuid-456' })
        };
        mockIdService = {
            getZohoId: jest.fn().mockResolvedValue(null),
            saveMapping: jest.fn().mockResolvedValue(undefined)
        };
        handler = new VentrataWebhookHandler(mockIdService, mockZohoService);
    });

    it('should process confirmed booking and update idempotency map', async () => {
        await handler.handleWebhook(mockEvent);

        expect(mockIdService.getZohoId).toHaveBeenCalledWith('booking-uuid-456', 'ventrata');
        expect(mockZohoService.upsertContact).toHaveBeenCalled();
        expect(mockZohoService.upsertBooking).toHaveBeenCalled();
        expect(mockIdService.saveMapping).toHaveBeenCalledWith('booking-uuid-456', 'zoho-booking-789', 'ventrata');
    });

    it('should skip non-confirmed bookings', async () => {
        const cancelledEvent = {
            ...mockEvent,
            booking: { ...mockEvent.booking, status: 'CANCELLED' }
        } as any;

        await handler.handleWebhook(cancelledEvent);

        expect(mockZohoService.upsertContact).not.toHaveBeenCalled();
        expect(mockIdService.saveMapping).not.toHaveBeenCalled();
    });

    it('should skip non-booking_update events', async () => {
        const otherEvent = {
            ...mockEvent,
            webhook: { ...mockEvent.webhook, event: 'availability_update' }
        } as any;

        await handler.handleWebhook(otherEvent);

        expect(mockZohoService.upsertContact).not.toHaveBeenCalled();
    });
});
