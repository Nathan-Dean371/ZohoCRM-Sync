import { WeTravelAdapter } from '../services/integrations/wetravel-adapter';

describe('WeTravelAdapter', () => {
    it('normalizes booking.created events into canonical contact and booking sync shapes', () => {
        const adapter = new WeTravelAdapter();

        const result = adapter.normalizeWebhookEvent({
            id: 'evt_123456',
            type: 'booking.created',
            timestamp: '2026-06-16T12:00:00.000Z',
            data: {
                booking: {
                    id: 'wt_booking_789',
                    reference: 'WT-1001',
                    created_at: '2026-06-15T09:30:00.000Z',
                    travel_date: '2026-07-01',
                    title: 'Summer Tour'
                },
                customer: {
                    first_name: 'Ada',
                    last_name: 'Lovelace',
                    email: 'ada@example.com',
                    phone: '+15555550123',
                    country: 'GB'
                }
            }
        });

        expect(result.status).toBe('normalized');
        if (result.status !== 'normalized') {
            throw new Error('Expected a normalized WeTravel event');
        }

        expect(result.data.contact).toEqual({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            phone: '+15555550123',
            country: 'GB'
        });
        expect(result.data.booking).toEqual({
            reference: 'WT-1001',
            name: 'Booking WT-1001',
            bookingDate: '2026-06-15T09:30:00.000Z',
            product: 'Summer Tour',
            travelDate: '2026-07-01'
        });
        expect(result.diagnostics).toEqual(expect.objectContaining({
            source: 'wetravel',
            eventType: 'booking.created',
            eventId: 'evt_123456',
            outcome: 'normalized'
        }));
    });

    it('skips unsupported events with explicit diagnostics outcome', () => {
        const adapter = new WeTravelAdapter();

        const result = adapter.normalizeWebhookEvent({
            id: 'evt_unsupported_001',
            type: 'invoice.paid',
            data: {
                invoice: {
                    id: 'wt_invoice_123'
                }
            }
        });

        expect(result.status).toBe('skipped');
        if (result.status !== 'skipped') {
            throw new Error('Expected an unsupported WeTravel event to be skipped');
        }

        expect(result.reason).toBe('unsupported_event');
        expect(result.diagnostics).toEqual(expect.objectContaining({
            source: 'wetravel',
            eventType: 'invoice.paid',
            eventId: 'evt_unsupported_001',
            outcome: 'skipped'
        }));
    });
});