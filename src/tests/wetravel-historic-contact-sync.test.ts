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
                Country: 'GB'
            });
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: 'Grace',
                Last_Name: 'Hopper',
                Email: 'grace@example.com',
                Phone: '+15555550002',
                Country: 'US'
            });

            // Verify result indicates success
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(2);
            expect(result.contactsFailed).toBe(0);
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
                Country: null
            });

            // Second contact: missing first_name should default to empty string
            expect(zohoService.upsertContact).toHaveBeenCalledWith({
                First_Name: '',
                Last_Name: 'Hopper',
                Email: null,
                Phone: '+15555550002',
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
                Country: 'GB'
            });

            // Verify booking was created with Contact_Id linkage
            expect(zohoService.upsertBooking).toHaveBeenCalledTimes(1);
            expect(zohoService.upsertBooking).toHaveBeenCalledWith({
                Booking_Ref: 'WT-2026-001',
                Name: 'Summer Adventure',
                Contact_Id: 'zoho-contact-1',
                Product: 'Summer Adventure',
                Travel_Date: '2026-07-15',
                Booking_Date: '2026-06-01'
            });

            // Verify idempotency tracking with correct source_type
            expect(idempotencyService.saveMapping).toHaveBeenCalledWith(
                'WT-2026-001',
                'wetravel_booking',
                'zoho-booking-1',
                'booking'
            );

            // Verify job counters updated
            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(1);
            expect(result.bookingsProcessed).toBe(1);
            expect(result.bookingsFailed).toBe(0);
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
