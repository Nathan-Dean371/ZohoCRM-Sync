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
            isStale: jest.fn().mockResolvedValue(false),
            saveMapping: jest.fn().mockResolvedValue(undefined)
        };
        handler = new VentrataWebhookHandler(mockIdService, mockZohoService);
    });

    it('should process confirmed booking and update idempotency map', async () => {
        await handler.handleWebhook(mockEvent);

        expect(mockZohoService.upsertContact).toHaveBeenCalled();
        expect(mockZohoService.upsertBooking).toHaveBeenCalled();
        expect(mockIdService.saveMapping).toHaveBeenCalledWith('booking-uuid-456', 'zoho-booking-789', 'ventrata', undefined);
    });

    it('should map cancelled bookings to the Cancelled status field instead of skipping', async () => {
        const cancelledEvent = {
            ...mockEvent,
            booking: { ...mockEvent.booking, status: 'CANCELLED' }
        } as any;

        await handler.handleWebhook(cancelledEvent);

        expect(mockZohoService.upsertContact).toHaveBeenCalled();
        expect(mockZohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
            Booking_Status: 'Cancelled',
            Status: 'Cancelled'
        }));
        expect(mockIdService.saveMapping).toHaveBeenCalled();
    });

    it('should map confirmed bookings to the Confirmed status field', async () => {
        await handler.handleWebhook(mockEvent);

        expect(mockZohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
            Booking_Status: 'Confirmed',
            Status: 'Confirmed'
        }));
    });

    it('should skip Zoho sync for redeemed bookings and advance the stored update timestamp', async () => {
        mockIdService.getZohoId.mockResolvedValue('zoho-booking-789');
        const redeemedBooking = {
            ...mockEvent.booking,
            status: 'REDEEMED',
            utcUpdatedAt: '2023-01-03T12:00:00Z'
        } as any;

        const result = await handler.processBooking(redeemedBooking);

        expect(mockZohoService.upsertContact).not.toHaveBeenCalled();
        expect(mockZohoService.upsertBooking).not.toHaveBeenCalled();
        expect(mockIdService.saveMapping).toHaveBeenCalledWith(
            'booking-uuid-456',
            'zoho-booking-789',
            'ventrata',
            '2023-01-03T12:00:00Z'
        );
        expect(result).toEqual({ zohoBookingId: 'zoho-booking-789', missingContact: false });
    });

    it('should convert pricing.net using currencyPrecision and set currency', async () => {
        const pricingEvent = {
            ...mockEvent,
            booking: {
                ...mockEvent.booking,
                pricing: {
                    original: 15550,
                    retail: 15550,
                    net: 15550,
                    currencyPrecision: 2,
                    currency: 'EUR'
                }
            }
        } as any;

        await handler.handleWebhook(pricingEvent);

        expect(mockZohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
            Booking_Amount: 155.5,
            Booking_Currency: 'EUR',
            Currency: 'EUR'
        }));
    });

    it('should map allowMarketing consent including explicit false', async () => {
        const consentEvent = {
            ...mockEvent,
            booking: {
                ...mockEvent.booking,
                contact: {
                    ...mockEvent.booking!.contact,
                    allowMarketing: false
                }
            }
        } as any;

        await handler.handleWebhook(consentEvent);

        expect(mockZohoService.upsertContact).toHaveBeenCalledWith(expect.objectContaining({
            Marketing_Consent: false
        }));
    });

    it('should sync booking without Contact_Id if both email and phone are missing', async () => {
        const noIdentityEvent = {
            ...mockEvent,
            booking: {
                ...mockEvent.booking,
                contact: {
                    fullName: 'Anonymous Person',
                    emailAddress: null,
                    phoneNumber: null
                }
            }
        } as any;

        const result = await handler.processBooking(noIdentityEvent.booking);

        expect(mockZohoService.upsertContact).not.toHaveBeenCalled();
        expect(mockZohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
            Contact_Id: undefined,
            Booking_Ref: 'booking-uuid-456'
        }));
        expect(result.missingContact).toBe(true);
    });

    it('should reject stale update if timestamp is older than stored timestamp', async () => {
        mockIdService.isStale.mockResolvedValue(true);
        mockIdService.getZohoId.mockResolvedValue('zoho-booking-789');

        const staleEvent = {
            ...mockEvent,
            booking: {
                ...mockEvent.booking,
                utcUpdatedAt: '2022-01-01T00:00:00Z'
            }
        } as any;

        const result = await handler.processBooking(staleEvent.booking);

        expect(mockZohoService.upsertContact).not.toHaveBeenCalled();
        expect(mockZohoService.upsertBooking).not.toHaveBeenCalled();
        expect(result.zohoBookingId).toBe('zoho-booking-789');
    });

    it('should update Zoho when a repeated webhook arrives with changed fields', async () => {
        mockIdService.getZohoId.mockResolvedValue('zoho-booking-789');

        const updatedEvent = {
            ...mockEvent,
            booking: {
                ...mockEvent.booking,
                utcUpdatedAt: '2023-01-02T12:00:00Z',
                product: { internalName: 'Updated Tour Name' },
                contact: { ...mockEvent.booking!.contact, phoneNumber: '+19998887777' }
            }
        } as any;

        await handler.handleWebhook(mockEvent);
        await handler.handleWebhook(updatedEvent);

        expect(mockZohoService.upsertContact).toHaveBeenCalledTimes(2);
        expect(mockZohoService.upsertBooking).toHaveBeenCalledTimes(2);
        expect(mockZohoService.upsertContact).toHaveBeenLastCalledWith(expect.objectContaining({
            Phone: '+19998887777'
        }));
        expect(mockZohoService.upsertBooking).toHaveBeenLastCalledWith(expect.objectContaining({
            Product: 'Updated Tour Name'
        }));
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
