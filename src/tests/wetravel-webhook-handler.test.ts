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

        expect(idService.getZohoId).toHaveBeenCalledWith('wt-booking-123', 'wetravel');
        expect(zohoService.upsertContact).toHaveBeenCalledTimes(1);
        expect(zohoService.upsertBooking).toHaveBeenCalledTimes(1);
        expect(idService.saveMapping).toHaveBeenCalledWith('wt-booking-123', 'zoho-booking-789', 'wetravel');
    });

    it('maps booking amount and currency when present on webhook payload', async () => {
        const idService = {
            getZohoId: jest.fn().mockResolvedValue(null),
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
                totalAmount: '5532.00',
                currency: 'eur',
                status: 'CONFIRMED'
            }
        };

        await handler.handleWebhook(event);

        expect(zohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
            Booking_Amount: 5532,
            Booking_Currency: 'EUR'
        }));
    });

it('normalizes us-formatted booking amounts before upserting', async () => {
            const idService = {
                getZohoId: jest.fn().mockResolvedValue(null),
                saveMapping: jest.fn().mockResolvedValue(undefined)
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-123' }),
                upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-789' })
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const event = {
                booking: {
                    uuid: 'wt-booking-456',
                    contact: {
                        firstName: 'Ada',
                        lastName: 'Lovelace',
                        email: 'ada@example.com'
                    },
                    productName: 'Summer Tour',
                    utcConfirmedAt: '2026-06-16T12:00:00.000Z',
                    confirmedAt: '2026-06-16T12:00:00.000Z',
                    totalAmount: '$5,890.00',
                    currency: 'usd',
                    status: 'CONFIRMED'
                }
            };

            await handler.handleWebhook(event);

            expect(zohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
                Booking_Amount: 5890,
                Booking_Currency: 'USD'
        }));
    });

    it('prefers trip metadata when productName is missing on the booking payload', async () => {
        const idService = {
            getZohoId: jest.fn().mockResolvedValue(null),
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
                trip: {
                    title: 'Summer Tour 2026'
                },
                utcConfirmedAt: '2026-06-16T12:00:00.000Z',
                confirmedAt: '2026-06-16T12:00:00.000Z',
                status: 'CONFIRMED'
            }
        };

        await handler.handleWebhook(event);

        expect(zohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
            Product: 'Summer Tour 2026',
            Name: expect.stringContaining('Summer Tour 2026')
        }));
    });

    it('uses nested order option metadata when shallow product fields are missing', async () => {
        const idService = {
            getZohoId: jest.fn().mockResolvedValue(null),
            saveMapping: jest.fn().mockResolvedValue(undefined)
        };

        const zohoService = {
            upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-123' }),
            upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-789' })
        };

        const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

        const event = {
            booking: {
                id: '2768666542781505536',
                contact: {
                    firstName: 'William',
                    lastName: 'Marshall',
                    email: 'wpmwpm1@hotmail.com'
                },
                order: {
                    options: [
                        {
                            name: 'Family Room'
                        }
                    ]
                },
                utcConfirmedAt: '2026-06-16T12:00:00.000Z',
                confirmedAt: '2026-06-16T12:00:00.000Z',
                status: 'CONFIRMED'
            }
        };

        await handler.handleWebhook(event);

        expect(zohoService.upsertBooking).toHaveBeenCalledWith(expect.objectContaining({
            Booking_Ref: '2768666542781505536',
            Product: 'Family Room',
            Name: expect.stringContaining('Family Room')
        }));
    });

    describe('Lead Webhooks', () => {
        it('handles lead.created events by creating contacts in Zoho', async () => {
            const idService = {
                getZohoId: jest.fn().mockResolvedValue(null),
                saveMapping: jest.fn().mockResolvedValue(undefined)
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-456' })
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created',
                lead: {
                    uuid: 'wt-lead-123',
                    firstName: 'Jane',
                    lastName: 'Doe',
                    email: 'jane@example.com',
                    phone: '+1234567890',
                    country: 'US'
                }
            };

            await handler.handleWebhook(leadEvent);

            expect(idService.getZohoId).toHaveBeenCalledWith('wt-lead-123', 'wetravel');
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Jane',
                Last_Name: 'Doe',
                Email: 'jane@example.com',
                Phone: '+1234567890',
                Mobile: '+1234567890',
                Country: 'US'
            });
            expect(idService.saveMapping).toHaveBeenCalledWith('wt-lead-123', 'zoho-contact-456', 'wetravel');
        });

        it('skips duplicate lead.created events by checking idempotency', async () => {
            const idService = {
                getZohoId: jest.fn().mockResolvedValue('zoho-contact-456'),
                saveMapping: jest.fn().mockResolvedValue(undefined)
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-456' })
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created',
                lead: {
                    uuid: 'wt-lead-123',
                    firstName: 'Jane',
                    lastName: 'Doe',
                    email: 'jane@example.com'
                }
            };

            await handler.handleWebhook(leadEvent);

            expect(zohoService.upsertContact).not.toHaveBeenCalled();
            expect(idService.saveMapping).not.toHaveBeenCalled();
        });

        it('handles leads with alternative field names (emailAddress instead of email)', async () => {
            const idService = {
                getZohoId: jest.fn().mockResolvedValue(null),
                saveMapping: jest.fn().mockResolvedValue(undefined)
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-789' })
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created',
                lead: {
                    uuid: 'wt-lead-456',
                    firstName: 'John',
                    lastName: 'Smith',
                    emailAddress: 'john.smith@example.com',
                    phoneNumber: '+44123456789',
                    countryCode: 'GB'
                }
            };

            await handler.handleWebhook(leadEvent);

            expect(zohoService.upsertContact).toHaveBeenCalledWith(
                expect.objectContaining({
                    Email: 'john.smith@example.com',
                    Phone: '+44123456789',
                    Country: 'GB'
                })
            );
        });

        it('handles leads with fullName instead of separate firstName/lastName', async () => {
            const idService = {
                getZohoId: jest.fn().mockResolvedValue(null),
                saveMapping: jest.fn().mockResolvedValue(undefined)
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-999' })
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created',
                lead: {
                    uuid: 'wt-lead-789',
                    fullName: 'Alice Johnson',
                    email: 'alice@example.com'
                }
            };

            await handler.handleWebhook(leadEvent);

            expect(zohoService.upsertContact).toHaveBeenCalledWith(
                expect.objectContaining({
                    First_Name: 'Alice',
                    Last_Name: 'Johnson'
                })
            );
        });

        it('handles lead.created events with nested data structure', async () => {
            const idService = {
                getZohoId: jest.fn().mockResolvedValue(null),
                saveMapping: jest.fn().mockResolvedValue(undefined)
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-nested' })
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created',
                data: {
                    lead: {
                        uuid: 'wt-lead-nested',
                        firstName: 'Bob',
                        lastName: 'Builder',
                        email: 'bob@example.com'
                    }
                }
            };

            await handler.handleWebhook(leadEvent);

            expect(zohoService.upsertContact).toHaveBeenCalledWith(
                expect.objectContaining({
                    First_Name: 'Bob',
                    Last_Name: 'Builder',
                    Email: 'bob@example.com'
                })
            );
            expect(idService.saveMapping).toHaveBeenCalledWith('wt-lead-nested', 'zoho-contact-nested', 'wetravel');
        });

        it('handles lead.created events with minimal required fields', async () => {
            const idService = {
                getZohoId: jest.fn().mockResolvedValue(null),
                saveMapping: jest.fn().mockResolvedValue(undefined)
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-minimal' })
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created',
                lead: {
                    id: 'wt-lead-minimal'
                }
            };

            await handler.handleWebhook(leadEvent);

            expect(zohoService.upsertContact).toHaveBeenCalledWith(
                expect.objectContaining({
                    First_Name: '',
                    Last_Name: 'Unknown'
                })
            );
        });

        it('skips lead events without lead data', async () => {
            const idService = {
                getZohoId: jest.fn(),
                saveMapping: jest.fn()
            };

            const zohoService = {
                upsertContact: jest.fn()
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created'
            };

            await handler.handleWebhook(leadEvent);

            expect(zohoService.upsertContact).not.toHaveBeenCalled();
            expect(idService.saveMapping).not.toHaveBeenCalled();
        });

        it('skips lead events without a lead ID', async () => {
            const idService = {
                getZohoId: jest.fn(),
                saveMapping: jest.fn()
            };

            const zohoService = {
                upsertContact: jest.fn()
            };

            const handler = new WeTravelWebhookHandler(idService as any, zohoService as any);

            const leadEvent = {
                type: 'lead.created',
                lead: {
                    firstName: 'Jane',
                    lastName: 'Doe'
                }
            };

            await handler.handleWebhook(leadEvent);

            expect(zohoService.upsertContact).not.toHaveBeenCalled();
            expect(idService.saveMapping).not.toHaveBeenCalled();
        });
    });
});