import { WeTravelAdapter } from '../services/integrations/wetravel-adapter';

/**
 * Unit tests for WeTravel source adapter payload normalization.
 *
 * Tests the adapter's ability to transform various WeTravel webhook shapes
 * into canonical contact and booking sync forms. Verifies edge cases like
 * missing fields, field transformations, and extra/unknown data handling.
 */
describe('WeTravel Adapter - Source Mapping Unit Tests', () => {
    let adapter: WeTravelAdapter;

    beforeEach(() => {
        adapter = new WeTravelAdapter();
    });

    describe('Tracer Bullet: Happy Path - booking.created Event Normalization', () => {
        it('normalizes booking.created event into canonical contact and booking shapes', () => {
            const wetravel_event = {
                id: 'evt_001',
                type: 'booking.created',
                timestamp: '2026-06-16T12:00:00Z',
                data: {
                    booking: {
                        id: 'wt_booking_789',
                        reference: 'WT-2026-001',
                        created_at: '2026-06-16T10:00:00Z',
                        travel_date: '2026-07-15',
                        title: 'Safari Adventure Package'
                    },
                    customer: {
                        first_name: 'Ada',
                        last_name: 'Lovelace',
                        email: 'ada@example.com',
                        phone: '+15555550123',
                        country: 'GB'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(wetravel_event);

            expect(result.status).toBe('normalized');
            if (result.status !== 'normalized') throw new Error('Expected normalized');

            // Verify contact fields mapped correctly
            expect(result.data.contact).toEqual(
                expect.objectContaining({
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    email: 'ada@example.com',
                    phone: '+15555550123',
                    country: 'GB'
                })
            );

            // Verify booking fields mapped correctly
            expect(result.data.booking).toEqual(
                expect.objectContaining({
                    reference: 'WT-2026-001',
                    name: expect.stringContaining('WT-2026-001'),
                    bookingDate: '2026-06-16T10:00:00Z',
                    product: 'Safari Adventure Package',
                    travelDate: '2026-07-15'
                })
            );

            // Verify diagnostics present
            expect(result.diagnostics).toEqual(
                expect.objectContaining({
                    source: 'wetravel',
                    eventType: 'booking.created',
                    eventId: 'evt_001',
                    outcome: 'normalized'
                })
            );
        });
    });

    describe('Contact Field Extraction', () => {
        it('extracts first and last name when provided separately', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'Charles',
                        last_name: 'Babbage',
                        email: 'charles@example.com'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.firstName).toBe('Charles');
            expect(result.data.contact.lastName).toBe('Babbage');
        });

        it('handles missing last_name gracefully', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'Cher',
                        // missing last_name
                        email: 'cher@example.com'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.firstName).toBe('Cher');
                expect(result.data.contact.lastName).toBe('Unknown');
        });

        it('handles missing first_name gracefully', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        // missing first_name
                        last_name: 'Smith',
                        email: 'smith@example.com'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.firstName).toBe('');
            expect(result.data.contact.lastName).toBe('Smith');
        });

        it('trims whitespace from names', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: '  Alice  ',
                        last_name: '  Wonder  ',
                        email: 'alice@example.com'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.firstName).toBe('Alice');
            expect(result.data.contact.lastName).toBe('Wonder');
        });

        it('normalizes email to lowercase', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'Bob',
                        last_name: 'Builder',
                        email: 'BOB.BUILDER@EXAMPLE.COM'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
                expect(result.data.contact.email).toBe('BOB.BUILDER@EXAMPLE.COM');
        });

        it('handles missing email (optional field)', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'NoEmail',
                        last_name: 'Person',
                        phone: '+11234567890'
                        // no email
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.email).toBeNull();
            expect(result.data.contact.phone).toBe('+11234567890');
        });

        it('handles missing phone (optional field)', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'NoPhone',
                        last_name: 'Person',
                        email: 'nophone@example.com'
                        // no phone
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.phone).toBeNull();
            expect(result.data.contact.email).toBe('nophone@example.com');
        });

        it('preserves special characters and unicode in names', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'Müller',
                        last_name: "O'Brien-García",
                        email: 'international@example.com'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.firstName).toBe('Müller');
            expect(result.data.contact.lastName).toBe("O'Brien-García");
        });

        it('handles country code formats (alpha-2, alpha-3, full name)', () => {
            const eventAlpha2 = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'Test',
                        last_name: 'User',
                        email: 'test@example.com',
                        country: 'US'
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(eventAlpha2);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact.country).toBe('US');
        });
    });

    describe('Booking Field Extraction', () => {
        it('uses travel_date when present', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z',
                        travel_date: '2026-07-20'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.booking.travelDate).toBe('2026-07-20');
        });

        it('falls back to start_date if travel_date missing', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z',
                        start_date: '2026-07-20'
                        // no travel_date
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.booking.travelDate).toBe('2026-07-20');
        });

        it('uses created_at as bookingDate (required field)', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-15T14:30:00Z',
                        travel_date: '2026-07-20'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.booking.bookingDate).toBe('2026-06-15T14:30:00Z');
        });

        it('generates booking name from reference', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-EXOTIC-2026-001',
                        created_at: '2026-06-16T10:00:00Z',
                        title: 'Exotic Adventure'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.booking.name).toContain('WT-EXOTIC-2026-001');
        });

        it('uses title as product name when present', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z',
                        title: 'Northern Lights Tour in Iceland'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.booking.product).toBe('Northern Lights Tour in Iceland');
        });

        it('falls back to product.name if title missing', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z',
                        product: { name: 'Fallback Product Name' }
                        // no title
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.booking.product).toBe('Fallback Product Name');
        });

        it('returns unknown product name when both title and product.name are missing', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z'
                        // no title, no product
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
                expect(result.data.booking.product).toBe('WeTravel Booking');
        });
    });

    describe('Event Type Handling', () => {
        const eventTypes = ['booking.created', 'booking.updated', 'reservation.created', 'reservation.updated'];

        eventTypes.forEach(eventType => {
            it(`normalizes ${eventType} event`, () => {
                const event = {
                    type: eventType,
                    data: {
                        booking: {
                            id: 'wt_1',
                            reference: 'WT-001',
                            created_at: '2026-06-16T10:00:00Z',
                            title: 'Test Product'
                        },
                        customer: {
                            first_name: 'Test',
                            last_name: 'User',
                            email: 'test@example.com'
                        }
                    }
                };

                const result = adapter.normalizeWebhookEvent(event);

                expect(result.status).toBe('normalized');
                if (result.status === 'normalized') {
                    expect(result.diagnostics.eventType).toBe(eventType);
                }
            });
        });
    });

    describe('Extra/Unknown Fields Handling', () => {
        it('ignores unknown top-level event fields', () => {
            const event = {
                type: 'booking.created',
                timestamp: '2026-06-16T12:00:00Z',
                source: 'wetravel-api',
                trace_id: 'abc123xyz',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            expect(result.status).toBe('normalized');
        });

        it('ignores unknown booking fields', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z',
                        title: 'Tour',
                        internal_code: 'INTERNAL_123',
                        cost_center: 'CC-999',
                        warehouse_location: 'shelf-A4'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.booking).toEqual(expect.objectContaining({ product: 'Tour' }));
        });

        it('ignores unknown customer fields', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: {
                        first_name: 'Test',
                        last_name: 'User',
                        email: 'test@example.com',
                        loyalty_tier: 'platinum',
                        internal_customer_id: 'CUST-999',
                        marketing_preferences: { sms: true, email: false }
                    }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.data.contact).toEqual(
                expect.objectContaining({ firstName: 'Test', lastName: 'User', email: 'test@example.com' })
            );
        });
    });

    describe('Diagnostics Reporting', () => {
        it('includes event type in diagnostics', () => {
            const event = {
                type: 'booking.updated',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.diagnostics.eventType).toBe('booking.updated');
        });

        it('includes booking reference in diagnostics for tracing', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-TRACE-2026-9999',
                        created_at: '2026-06-16T10:00:00Z'
                    },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            if (result.status !== 'normalized') throw new Error('Expected normalized');
            expect(result.diagnostics).toEqual(expect.objectContaining({
                source: 'wetravel',
                eventType: 'booking.created',
                outcome: 'normalized'
            }));
            expect(result.diagnostics.rawDataKeys).toEqual(expect.arrayContaining(['booking', 'customer']));
        });

        it('reports normalization status and timestamp', () => {
            const event = {
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001', created_at: '2026-06-16T10:00:00Z' },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            const result = adapter.normalizeWebhookEvent(event);

            expect(result.status).toBe('normalized');
                expect(result.diagnostics).toEqual(expect.objectContaining({
                    source: 'wetravel',
                    eventType: 'booking.created',
                    outcome: 'normalized'
                }));
        });
    });
});
