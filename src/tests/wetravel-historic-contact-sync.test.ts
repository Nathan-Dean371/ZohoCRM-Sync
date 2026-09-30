import { WeTravelHistoricContactSyncService } from '../services/wetravel/wetravel-historic-contact-sync-service';

// Mock Prisma Client
jest.mock('@prisma/client', () => {
    const mockPrismaClient = {
        weTravelImportJob: {
            create: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
            deleteMany: jest.fn()
        },
        $disconnect: jest.fn()
    };
    return {
        PrismaClient: jest.fn(() => mockPrismaClient)
    };
});

describe('WeTravelHistoricContactSyncService', () => {
    let mockPrisma: any;
    let mockIdService: any;

    beforeEach(() => {
        // Get the mocked Prisma instance
        const { PrismaClient } = require('@prisma/client');
        mockPrisma = new PrismaClient();

        // Mock idempotency service
        mockIdService = {
            saveMapping: jest.fn().mockResolvedValue(undefined),
            getZohoId: jest.fn().mockResolvedValue(null)
        };

        // Setup default mock implementations
        mockPrisma.weTravelImportJob.create.mockResolvedValue({
            id: 'job-123',
            company_id: 'company-123',
            status: 'in_progress',
            contacts_processed: 0,
            contacts_failed: 0,
            started_at: new Date(),
            completed_at: null,
            error_message: null,
            failure_details: null
        });

        mockPrisma.weTravelImportJob.update.mockResolvedValue({
            id: 'job-123',
            company_id: 'company-123',
            status: 'completed',
            contacts_processed: 2,
            contacts_failed: 0,
            started_at: new Date(),
            completed_at: new Date(),
            error_message: null,
            failure_details: null
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('startImport', () => {
        it('fetches trips and bookings, then upserts unique contacts to Zoho', async () => {
            // Mock WeTravel API client
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([
                    { uuid: 'trip-1', name: 'Summer Adventure' },
                    { uuid: 'trip-2', name: 'Winter Escape' }
                ]),
                fetchBookings: jest.fn()
                    .mockResolvedValueOnce([
                        {
                            id: 'booking-1',
                            buyer: {
                                first_name: 'Ada',
                                last_name: 'Lovelace',
                                email: 'ada@example.com',
                                phone: '+15555550001',
                                country: 'GB'
                            }
                        }
                    ])
                    .mockResolvedValueOnce([
                        {
                            id: 'booking-2',
                            buyer: {
                                first_name: 'Grace',
                                last_name: 'Hopper',
                                email: 'grace@example.com',
                                phone: '+15555550002',
                                country: 'US'
                            }
                        },
                        {
                            id: 'booking-3',
                            buyer: {
                                first_name: 'Ada', // Duplicate contact
                                last_name: 'Lovelace',
                                email: 'ada@example.com',
                                phone: '+15555550001',
                                country: 'GB'
                            }
                        }
                    ])
            };

            // Mock Zoho CRM service
            const zohoService = {
                upsertContact: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-contact-1' })
                    .mockResolvedValueOnce({ id: 'zoho-contact-2' })
            };

            // Mock token manager
            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('mock-access-token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            // Verify trips were fetched
            expect(weTravelClient.fetchTrips).toHaveBeenCalledTimes(1);

            // Verify bookings were fetched for each trip
            expect(weTravelClient.fetchBookings).toHaveBeenCalledTimes(2);
            expect(weTravelClient.fetchBookings).toHaveBeenCalledWith('trip-1');
            expect(weTravelClient.fetchBookings).toHaveBeenCalledWith('trip-2');

            // Verify only unique contacts were upserted to Zoho (2 unique, not 3 total)
            expect(zohoService.upsertContact).toHaveBeenCalledTimes(2);
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Ada',
                Last_Name: 'Lovelace',
                Email: 'ada@example.com',
                Phone: '+15555550001',
                Mobile: '+15555550001',
                Country: 'GB'
            });
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Grace',
                Last_Name: 'Hopper',
                Email: 'grace@example.com',
                Phone: '+15555550002',
                Mobile: '+15555550002',
                Country: 'US'
            });

            // Verify result indicates success
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(2);
            expect(result.contactsFailed).toBe(0);
        });

        it('continues import when a trip bookings request returns 404', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([
                    { uuid: 'trip-missing', name: 'Missing Trip' },
                    { uuid: 'trip-ok', name: 'Working Trip' }
                ]),
                fetchBookings: jest.fn()
                    .mockRejectedValueOnce(new Error('WeTravel API error: 404 Not Found'))
                    .mockResolvedValueOnce([
                        {
                            id: 'booking-2',
                            reference: 'WT-OK-002',
                            product_name: 'Working Trip',
                            travel_date: '2026-07-15',
                            created_at: '2026-06-01T10:00:00Z',
                            buyer: {
                                first_name: 'Grace',
                                last_name: 'Hopper',
                                email: 'grace@example.com',
                                phone: '+15555550002',
                                country: 'US'
                            }
                        }
                    ])
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-2' }),
                upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-2' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            expect(weTravelClient.fetchBookings).toHaveBeenCalledTimes(2);
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Grace',
                Last_Name: 'Hopper',
                Email: 'grace@example.com',
                Phone: '+15555550002',
                Mobile: '+15555550002',
                Country: 'US'
            });
            expect(zohoService.upsertBooking).toHaveBeenCalledWith(
                expect.objectContaining({
                    Booking_Ref: 'WT-OK-002',
                    Contact_Id: 'zoho-contact-2',
                    Booking_Source: 'WeTravel'
                })
            );
            expect(result.status).toBe('completed');
            expect(result.bookingsProcessed).toBe(1);
        });

        it('uses trip_uuids when falling back to booked leads after trip booking 404s', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([
                    { uuid: 'trip-a', name: 'Trip A' },
                    { uuid: 'trip-b', name: 'Trip B' }
                ]),
                fetchBookings: jest.fn().mockRejectedValue(new Error('WeTravel API error: 404 Not Found')),
                fetchLeads: jest.fn().mockResolvedValue({
                    leads: [
                        {
                            id: 'booking-fallback-1',
                            reference: 'WT-FB-001',
                            product_name: 'Trip A',
                            travel_date: '2026-07-15',
                            created_at: '2026-06-01T10:00:00Z',
                            customer: {
                                first_name: 'Ada',
                                last_name: 'Lovelace',
                                email: 'ada@example.com',
                                phone: '+15555550001',
                                country: 'GB'
                            }
                        }
                    ],
                    pagination: {
                        current_page: 1,
                        total_count: 1,
                        per_page: 100
                    }
                })
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-1' }),
                upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-1' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            await service.startImport('company-123');

            expect(weTravelClient.fetchLeads).toHaveBeenCalledWith(
                expect.objectContaining({
                    trip_uuids: ['trip-a', 'trip-b'],
                    is_booked: true,
                    per_page: 100,
                    page: 1
                })
            );
        });

        it('retries booked lead fallback without trip_uuids when trip-scoped call returns no results', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-a', name: 'Trip A' }]),
                fetchBookings: jest.fn().mockRejectedValue(new Error('WeTravel API error: 404 Not Found')),
                fetchLeads: jest.fn().mockImplementation(async (options?: { trip_uuids?: string[]; is_booked?: boolean }) => {
                    if (options?.trip_uuids) {
                        return {
                            leads: [],
                            pagination: {
                                current_page: 1,
                                total_count: 0,
                                per_page: 100
                            }
                        };
                    }

                    return {
                        leads: [
                            {
                                id: 'booking-fallback-2',
                                reference: 'WT-FB-002',
                                product_name: 'Trip A',
                                travel_date: '2026-07-15',
                                created_at: '2026-06-01T10:00:00Z',
                                customer: {
                                    first_name: 'Grace',
                                    last_name: 'Hopper',
                                    email: 'grace@example.com',
                                    phone: '+15555550002',
                                    country: 'US'
                                }
                            }
                        ],
                        pagination: {
                            current_page: 1,
                            total_count: 1,
                            per_page: 100
                        }
                    };
                })
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-2' }),
                upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-2' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            await service.startImport('company-123');

            const bookedCalls = (weTravelClient.fetchLeads as jest.Mock).mock.calls
                .map((call) => call[0])
                .filter((payload) => payload?.is_booked === true);

            expect(bookedCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        trip_uuids: ['trip-a'],
                        is_booked: true,
                        per_page: 100,
                        page: 1
                    }),
                    expect.objectContaining({
                        is_booked: true,
                        per_page: 100,
                        page: 1
                    })
                ])
            );
        });

        it('expands buyer bookings into participant-level contacts and bookings when detail endpoint is available', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-a', name: 'Trip A' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-001',
                        trip_uuid: 'trip-a',
                        buyer_id: 2651160,
                        product_name: 'Family Room',
                        travel_date: '2027-06-06',
                        created_at: '2026-07-08T00:38:23.000Z',
                        total_amount: 2398200,
                        buyer: {
                            first_name: 'William',
                            last_name: 'Marshall',
                            email: 'wpmwpm1@hotmail.com',
                            phone: null,
                            country: null
                        }
                    }
                ]),
                fetchTripBuyerBookingDetails: jest.fn().mockResolvedValue({
                    participants: [
                        {
                            id: '2783882909382090752',
                            email: 'damianpmarshall@gmail.com',
                            first_name: 'Damian',
                            last_name: 'Marshall',
                            survey: [
                                {
                                    type: 'phone',
                                    answers: ['+12178406777']
                                }
                            ],
                            total_amount: 138300
                        }
                    ]
                })
            };

            const zohoService = {
                upsertContact: jest.fn().mockImplementation(async (contact: any) => ({
                    id: `zoho-contact-${(contact.Email || contact.Phone || 'unknown').toLowerCase()}`
                })),
                upsertBooking: jest.fn().mockImplementation(async (booking: any) => ({
                    id: `zoho-booking-${booking.Booking_Ref}`
                }))
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            expect(weTravelClient.fetchTripBuyerBookingDetails).toHaveBeenCalledWith('trip-a', '2651160');
            expect(zohoService.upsertContact).toHaveBeenCalledWith(
                expect.objectContaining({
                    First_Name: 'Damian',
                    Last_Name: 'Marshall',
                    Email: 'damianpmarshall@gmail.com',
                    Phone: '+12178406777',
                    Mobile: '+12178406777'
                })
            );
            expect(zohoService.upsertBooking).toHaveBeenCalledWith(
                expect.objectContaining({
                    Booking_Ref: 'WT-001:participant:2783882909382090752',
                    Contact_Id: 'zoho-contact-damianpmarshall@gmail.com',
                    Product: 'Family Room'
                })
            );
            expect(result.bookingsProcessed).toBeGreaterThanOrEqual(2);
        });

        it('upgrades generic booking names from buyer booking details when available', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-a', name: 'Trip A' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-001',
                        trip_uuid: 'trip-a',
                        buyer_id: 2651160,
                        product_name: 'WeTravel Booking',
                        travel_date: '2027-06-06',
                        created_at: '2026-07-08T00:38:23.000Z',
                        buyer: {
                            first_name: 'William',
                            last_name: 'Marshall',
                            email: 'wpmwpm1@hotmail.com',
                            phone: null,
                            country: null
                        }
                    }
                ]),
                fetchTripBuyerBookingDetails: jest.fn().mockResolvedValue({
                    orders: [
                        {
                            options: [
                                {
                                    name: 'Family Room'
                                }
                            ]
                        }
                    ],
                    participants: []
                })
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-1' }),
                upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-1' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            await service.startImport('company-123');

            expect(zohoService.upsertBooking).toHaveBeenCalledWith(
                expect.objectContaining({
                    Booking_Ref: 'WT-001',
                    Name: 'Family Room',
                    Product: 'Family Room'
                })
            );
        });

        it('normalizes contacts with missing fields using safe defaults', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        buyer: {
                            first_name: 'Ada',
                            // Missing last_name
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-2',
                        buyer: {
                            // Missing first_name
                            last_name: 'Hopper',
                            phone: '+15555550002'
                            // Missing email
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-1' })
                    .mockResolvedValueOnce({ id: 'zoho-2' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            await service.startImport('company-123');

            // First contact: missing last_name should default to "Unknown"
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Ada',
                Last_Name: 'Unknown',
                Email: 'ada@example.com',
                Phone: null,
                Mobile: null,
                Country: null
            });

            // Second contact: missing first_name should default to empty string
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: '',
                Last_Name: 'Hopper',
                Email: null,
                Phone: '+15555550002',
                Mobile: '+15555550002',
                Country: null
            });
        });

        it('rerunning import does not create duplicate contacts in Zoho', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-1' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            // Run import twice with same data
            await service.startImport('company-123');
            await service.startImport('company-123');

            // upsertContact is called twice (once per import)
            // but Zoho's upsert logic handles deduplication internally
            expect(zohoService.upsertContact).toHaveBeenCalledTimes(2);
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Ada',
                Last_Name: 'Lovelace',
                Email: 'ada@example.com',
                Phone: null,
                Mobile: null,
                Country: null
            });
        });

        it('syncs contact and associated bookings with idempotency tracking', async () => {
            // Mock WeTravel API with booking fields
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([
                    { uuid: 'trip-1', name: 'Summer Adventure' }
                ]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-2026-001',
                        product_name: 'Summer Adventure',
                        travel_date: '2026-07-15',
                        start_date: '2026-07-15',
                        created_at: '2026-06-01T10:00:00Z',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com',
                            phone: '+15555550001',
                            country: 'GB'
                        }
                    }
                ])
            };

            // Mock Zoho service
            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ 
                    id: 'zoho-contact-1',
                    First_Name: 'Ada',
                    Last_Name: 'Lovelace',
                    Email: 'ada@example.com'
                }),
                upsertBooking: jest.fn().mockResolvedValue({
                    id: 'zoho-booking-1',
                    Booking_Ref: 'WT-2026-001',
                    Name: 'Summer Adventure',
                    Contact_Id: 'zoho-contact-1',
                    Product: 'Summer Adventure',
                    Travel_Date: '2026-07-15',
                    Booking_Date: '2026-06-01'
                })
            };

            // Mock idempotency service
            const idempotencyService = {
                saveMapping: jest.fn().mockResolvedValue(undefined),
                getZohoId: jest.fn().mockResolvedValue(null)
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

            // Update mock Prisma to include booking counters
            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                bookings_processed: 1,
                bookings_failed: 0,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                idempotencyService as any
            );

            const result = await service.startImport('company-123');

            // Verify contact was created
            expect(zohoService.upsertContact).toHaveBeenCalledTimes(1);
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Ada',
                Last_Name: 'Lovelace',
                Email: 'ada@example.com',
                Phone: '+15555550001',
                Mobile: '+15555550001',
                Country: 'GB'
            });

            // Verify booking was created with Contact_Id linkage
            expect(zohoService.upsertBooking).toHaveBeenCalledTimes(1);
            expect(zohoService.upsertBooking).toHaveBeenCalledWith({
                Booking_Ref: 'WT-2026-001',
                Name: 'Summer Adventure',
                Contact_Id: 'zoho-contact-1',
                Product: 'Summer Adventure',
                Travel_Date: '2026-07-15T00:00:00+00:00',
                Booking_Date: '2026-06-01T10:00:00+00:00',
                Booking_Source: 'WeTravel'
            });

            // Verify idempotency tracking with correct source_type
            expect(idempotencyService.saveMapping).toHaveBeenCalledWith(
                'WT-2026-001',
                'zoho-booking-1',
                'wetravel'
            );

            // Verify job counters updated
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(1);
            expect(result.bookingsProcessed).toBe(1);
            expect(result.bookingsFailed).toBe(0);

            expect(
                consoleSpy.mock.calls.some((call) =>
                    String(call[0]).includes('[WeTravel Historic Sync] Summary (trip-bookings):')
                )
            ).toBe(true);

            consoleSpy.mockRestore();
        });

        it('maps lead first/last name, phone, and country when syncing contacts from leads endpoint', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn(),
                fetchBookings: jest.fn(),
                fetchLeads: jest.fn().mockImplementation(async (options?: { is_booked?: boolean }) => {
                    if (options?.is_booked) {
                        return {
                            leads: [],
                            pagination: {
                                current_page: 1,
                                total_count: 0,
                                per_page: 100
                            }
                        };
                    }

                    return {
                        leads: [
                            {
                                id: 'lead-abc',
                                first_name: 'Chris',
                                last_name: 'Trout',
                                email: 'ctrout@alphadogadv.com',
                                phone_number: '+15551234567',
                                country: 'US'
                            }
                        ],
                        pagination: {
                            current_page: 1,
                            total_count: 1,
                            per_page: 100
                        }
                    };
                })
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-1' }),
                upsertBooking: jest.fn()
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                bookings_processed: 0,
                bookings_failed: 0,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Chris',
                Last_Name: 'Trout',
                Email: 'ctrout@alphadogadv.com',
                Phone: '+15551234567',
                Mobile: '+15551234567',
                Country: 'US'
            });
            expect(result.contactsProcessed).toBe(1);
            expect(result.contactsFailed).toBe(0);
            expect(result.bookingsProcessed).toBe(0);
        });

        it('merges duplicate lead records by email and keeps richer name fields', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn(),
                fetchBookings: jest.fn(),
                fetchLeads: jest.fn().mockImplementation(async (options?: { is_booked?: boolean }) => {
                    if (options?.is_booked) {
                        return {
                            leads: [],
                            pagination: {
                                current_page: 1,
                                total_count: 0,
                                per_page: 100
                            }
                        };
                    }

                    return {
                        leads: [
                            {
                                id: 'lead-sparse',
                                email: 'damianpmarshall@gmail.com'
                            },
                            {
                                id: 'lead-rich',
                                email: 'damianpmarshall@gmail.com',
                                name: 'Damian Marshall',
                                phone: '+15551234567',
                                country: 'US'
                            }
                        ],
                        pagination: {
                            current_page: 1,
                            total_count: 2,
                            per_page: 100
                        }
                    };
                })
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-1' }),
                upsertBooking: jest.fn()
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                bookings_processed: 0,
                bookings_failed: 0,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            expect(zohoService.upsertContact).toHaveBeenCalledTimes(1);
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Damian',
                Last_Name: 'Marshall',
                Email: 'damianpmarshall@gmail.com',
                Phone: '+15551234567',
                Mobile: '+15551234567',
                Country: 'US'
            });
            expect(result.contactsProcessed).toBe(1);
            expect(result.contactsFailed).toBe(0);
        });

        it('enriches sparse lead contacts with customer details from booked leads', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn(),
                fetchBookings: jest.fn(),
                fetchLeads: jest.fn().mockImplementation(async (options?: { is_booked?: boolean }) => {
                    if (options?.is_booked) {
                        return {
                            leads: [
                                {
                                    id: 'booking-1',
                                    reference: 'WT-ENRICH-001',
                                    product_name: 'Craig Trout Birthday Trip to Ireland!',
                                    travel_date: '2025-12-05',
                                    created_at: '2023-12-13T00:00:00Z',
                                    customer: {
                                        first_name: 'Craig',
                                        last_name: 'Trout',
                                        email: 'ctrout@alphadogadv.com',
                                        phone: '715724603',
                                        country: 'US'
                                    }
                                }
                            ],
                            pagination: {
                                current_page: 1,
                                total_count: 1,
                                per_page: 100
                            }
                        };
                    }

                    return {
                        leads: [
                            {
                                id: 'lead-raw-1',
                                email: 'ctrout@alphadogadv.com'
                            }
                        ],
                        pagination: {
                            current_page: 1,
                            total_count: 1,
                            per_page: 100
                        }
                    };
                })
            };

            const zohoService = {
                upsertContact: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-contact-1' })
                    .mockResolvedValueOnce({ id: 'zoho-contact-1' }),
                upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-1' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                bookings_processed: 1,
                bookings_failed: 0,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            await service.startImport('company-123');

            expect(zohoService.upsertContact).toHaveBeenNthCalledWith(1, {
                First_Name: '',
                Last_Name: 'Unknown',
                Email: 'ctrout@alphadogadv.com',
                Phone: null,
                Mobile: null,
                Country: null
            });

            expect(zohoService.upsertContact).toHaveBeenNthCalledWith(2, {
                First_Name: 'Craig',
                Last_Name: 'Trout',
                Email: 'ctrout@alphadogadv.com',
                Phone: '715724603',
                Mobile: '715724603',
                Country: 'US'
            });
        });

        it('extracts contact details from nested participant payloads', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn(),
                fetchBookings: jest.fn(),
                fetchLeads: jest.fn().mockImplementation(async (options?: { is_booked?: boolean }) => {
                    if (options?.is_booked) {
                        return {
                            leads: [],
                            pagination: {
                                current_page: 1,
                                total_count: 0,
                                per_page: 100
                            }
                        };
                    }

                    return {
                        leads: [
                            {
                                id: 'lead-participant-1',
                                participant: {
                                    first_name: 'Craig',
                                    last_name: 'Trout',
                                    email: 'ctrout@alphadogadv.com',
                                    phone_number: '715724603',
                                    country_code: 'US'
                                }
                            }
                        ],
                        pagination: {
                            current_page: 1,
                            total_count: 1,
                            per_page: 100
                        }
                    };
                })
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-contact-1' }),
                upsertBooking: jest.fn()
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                bookings_processed: 0,
                bookings_failed: 0,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            await service.startImport('company-123');

            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Craig',
                Last_Name: 'Trout',
                Email: 'ctrout@alphadogadv.com',
                Phone: '715724603',
                Mobile: '715724603',
                Country: 'US'
            });
        });

        it('records progress and failures per contact', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-2',
                        buyer: {
                            first_name: 'Grace',
                            last_name: 'Hopper',
                            email: 'grace@example.com'
                        }
                    },
                    {
                        id: 'booking-3',
                        buyer: {
                            first_name: 'Alan',
                            last_name: 'Turing',
                            email: 'alan@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-1' })
                    .mockRejectedValueOnce(new Error('Zoho API rate limit'))
                    .mockResolvedValueOnce({ id: 'zoho-3' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(2); // Ada and Alan succeeded
            expect(result.contactsFailed).toBe(1); // Grace failed
        });

        it('skips bookings with missing required fields and increments bookingsFailed', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-2026-001',
                        product_name: 'Summer Adventure',
                        travel_date: '2026-07-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-2',
                        // Missing reference
                        product_name: 'Winter Trip',
                        travel_date: '2026-12-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-3',
                        reference: 'WT-2026-003',
                        // Missing product_name
                        travel_date: '2026-08-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-1' }),
                upsertBooking: jest.fn().mockResolvedValue({ id: 'zoho-booking-1' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                bookings_processed: 1,
                bookings_failed: 2,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            // Contact should be synced once
            expect(zohoService.upsertContact).toHaveBeenCalledTimes(1);

            // Only the first booking with all required fields should be synced
            expect(zohoService.upsertBooking).toHaveBeenCalledTimes(1);

            // Verify counters
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(1);
            expect(result.bookingsProcessed).toBe(1);
            expect(result.bookingsFailed).toBe(2); // Two bookings with missing fields
        });

        it('continues contact processing when Zoho booking API fails', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-2026-001',
                        product_name: 'Summer Adventure',
                        travel_date: '2026-07-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-2',
                        reference: 'WT-2026-002',
                        product_name: 'Winter Escape',
                        travel_date: '2026-12-15',
                        buyer: {
                            first_name: 'Grace',
                            last_name: 'Hopper',
                            email: 'grace@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-1' })
                    .mockResolvedValueOnce({ id: 'zoho-2' }),
                upsertBooking: jest.fn()
                    .mockRejectedValueOnce(new Error('Zoho API booking error'))
                    .mockResolvedValueOnce({ id: 'zoho-booking-2' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 2,
                contacts_failed: 0,
                bookings_processed: 1,
                bookings_failed: 1,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            // Both contacts should be synced
            expect(zohoService.upsertContact).toHaveBeenCalledTimes(2);

            // Both bookings should be attempted
            expect(zohoService.upsertBooking).toHaveBeenCalledTimes(2);

            // Job completes despite booking failure
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(2);
            expect(result.bookingsProcessed).toBe(1);
            expect(result.bookingsFailed).toBe(1);
        });

        it('completes with partial success when some bookings fail', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-2026-001',
                        product_name: 'Summer Adventure',
                        travel_date: '2026-07-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-2',
                        reference: 'WT-2026-002',
                        product_name: 'Fall Trip',
                        travel_date: '2026-09-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-3',
                        reference: 'WT-2026-003',
                        product_name: 'Winter Escape',
                        travel_date: '2026-12-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-1' }),
                upsertBooking: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-booking-1' })
                    .mockRejectedValueOnce(new Error('Zoho timeout'))
                    .mockResolvedValueOnce({ id: 'zoho-booking-3' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                bookings_processed: 2,
                bookings_failed: 1,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            // Verify partial success
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(1);
            expect(result.bookingsProcessed).toBe(2); // First and third succeeded
            expect(result.bookingsFailed).toBe(1); // Second failed
        });

        it('syncs multiple contacts each with multiple bookings independently', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-2026-001',
                        product_name: 'Summer Adventure',
                        travel_date: '2026-07-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-2',
                        reference: 'WT-2026-002',
                        product_name: 'Fall Trip',
                        travel_date: '2026-09-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-3',
                        reference: 'WT-2026-003',
                        product_name: 'Winter Escape',
                        travel_date: '2026-12-15',
                        buyer: {
                            first_name: 'Grace',
                            last_name: 'Hopper',
                            email: 'grace@example.com'
                        }
                    },
                    {
                        id: 'booking-4',
                        reference: 'WT-2026-004',
                        product_name: 'Spring Tour',
                        travel_date: '2027-03-15',
                        buyer: {
                            first_name: 'Grace',
                            last_name: 'Hopper',
                            email: 'grace@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-1' })
                    .mockResolvedValueOnce({ id: 'zoho-2' }),
                upsertBooking: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-booking-1' })
                    .mockResolvedValueOnce({ id: 'zoho-booking-2' })
                    .mockRejectedValueOnce(new Error('Zoho error'))
                    .mockResolvedValueOnce({ id: 'zoho-booking-4' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 2,
                contacts_failed: 0,
                bookings_processed: 3,
                bookings_failed: 1,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            // Both contacts synced
            expect(zohoService.upsertContact).toHaveBeenCalledTimes(2);

            // All bookings attempted
            expect(zohoService.upsertBooking).toHaveBeenCalledTimes(4);

            // Verify counters
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(2);
            expect(result.bookingsProcessed).toBe(3);
            expect(result.bookingsFailed).toBe(1);
        });

        it('skips booking sync when contact fails but continues with other contacts', async () => {
            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        reference: 'WT-2026-001',
                        product_name: 'Summer Adventure',
                        travel_date: '2026-07-15',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    },
                    {
                        id: 'booking-2',
                        reference: 'WT-2026-002',
                        product_name: 'Winter Escape',
                        travel_date: '2026-12-15',
                        buyer: {
                            first_name: 'Grace',
                            last_name: 'Hopper',
                            email: 'grace@example.com'
                        }
                    },
                    {
                        id: 'booking-3',
                        reference: 'WT-2026-003',
                        product_name: 'Spring Tour',
                        travel_date: '2027-03-15',
                        buyer: {
                            first_name: 'Alan',
                            last_name: 'Turing',
                            email: 'alan@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-1' })
                    .mockRejectedValueOnce(new Error('Contact API error'))
                    .mockResolvedValueOnce({ id: 'zoho-3' }),
                upsertBooking: jest.fn()
                    .mockResolvedValueOnce({ id: 'zoho-booking-1' })
                    // Grace's booking should NOT be attempted since contact failed
                    .mockResolvedValueOnce({ id: 'zoho-booking-3' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValue({
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 2,
                contacts_failed: 1,
                bookings_processed: 2,
                bookings_failed: 0,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            });

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            const result = await service.startImport('company-123');

            // All contacts attempted
            expect(zohoService.upsertContact).toHaveBeenCalledTimes(3);

            // Only 2 bookings should be attempted (Grace's contact failed, so her booking is skipped)
            expect(zohoService.upsertBooking).toHaveBeenCalledTimes(2);

            // Verify counters
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(2);
            expect(result.contactsFailed).toBe(1);
            expect(result.bookingsProcessed).toBe(2);
            expect(result.bookingsFailed).toBe(0); // Bookings not attempted when contact fails
        });
    });

    describe('getImportStatus', () => {
        it('retrieves import job status by ID', async () => {
            const mockJobData = {
                id: 'job-123',
                company_id: 'company-123',
                status: 'completed',
                contacts_processed: 1,
                contacts_failed: 0,
                started_at: new Date(),
                completed_at: new Date(),
                error_message: null,
                failure_details: null
            };

            mockPrisma.weTravelImportJob.update.mockResolvedValueOnce(mockJobData);
            mockPrisma.weTravelImportJob.findUnique.mockResolvedValueOnce(mockJobData);

            const weTravelClient = {
                fetchTrips: jest.fn().mockResolvedValue([{ uuid: 'trip-1' }]),
                fetchBookings: jest.fn().mockResolvedValue([
                    {
                        id: 'booking-1',
                        buyer: {
                            first_name: 'Ada',
                            last_name: 'Lovelace',
                            email: 'ada@example.com'
                        }
                    }
                ])
            };

            const zohoService = {
                upsertContact: jest.fn().mockResolvedValue({ id: 'zoho-1' })
            };

            const tokenManager = {
                getAccessToken: jest.fn().mockResolvedValue('token')
            };

            const service = new WeTravelHistoricContactSyncService(
                weTravelClient as any,
                zohoService as any,
                tokenManager as any,
                mockIdService
            );

            // Start import
            const result = await service.startImport('company-123');

            // Retrieve status by ID
            const status = await service.getImportStatus(result.id!);

            expect(status).not.toBeNull();
            expect(status?.status).toBe('completed');
            expect(status?.contactsProcessed).toBe(1);
            expect(status?.contactsFailed).toBe(0);
            expect(status?.startedAt).toBeInstanceOf(Date);
            expect(status?.completedAt).toBeInstanceOf(Date);
        });

        it('returns null for non-existent job ID', async () => {
            mockPrisma.weTravelImportJob.findUnique.mockResolvedValue(null);

            const service = new WeTravelHistoricContactSyncService(
                {} as any,
                {} as any,
                {} as any,
                {} as any
            );

            const status = await service.getImportStatus('non-existent-id');
            expect(status).toBeNull();
        });
    });
});
