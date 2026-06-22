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

    beforeEach(() => {
        // Get the mocked Prisma instance
        const { PrismaClient } = require('@prisma/client');
        mockPrisma = new PrismaClient();

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
                tokenManager as any
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
                tokenManager as any
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
                tokenManager as any
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
                tokenManager as any
            );

            const result = await service.startImport('company-123');

            expect(result.status).toBe('completed');
            expect(result.contactsProcessed).toBe(2); // Ada and Alan succeeded
            expect(result.contactsFailed).toBe(1); // Grace failed
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
                tokenManager as any
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
                {} as any
            );

            const status = await service.getImportStatus('non-existent-id');
            expect(status).toBeNull();
        });
    });
});
