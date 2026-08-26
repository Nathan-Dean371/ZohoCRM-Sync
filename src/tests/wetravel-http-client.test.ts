import { WeTravelHttpClient } from '../services/wetravel/wetravel-http-client';

describe('WeTravelHttpClient - Endpoint Integration', () => {
    let mockTokenManager: any;
    let httpClient: WeTravelHttpClient;

    beforeEach(() => {
        // Mock token manager
        mockTokenManager = {
            getAccessToken: jest.fn().mockResolvedValue('test-access-token')
        };

        // Mock global fetch
        global.fetch = jest.fn();

        httpClient = new WeTravelHttpClient(mockTokenManager);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('fetchTrips', () => {
        test('calls the correct draft_trips endpoint', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => []
            });

            await httpClient.fetchTrips();

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.wetravel.com/v2/draft_trips',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-access-token',
                        'Accept': 'application/json'
                    })
                })
            );
        });

        test('normalizes API response with id and title fields to uuid and name', async () => {
            const apiResponse = [
                {
                    id: 998076,
                    title: "5 Day Ireland West & South",
                    status: "published",
                    start_date: "2026-06-15"
                },
                {
                    id: 998080,
                    title: "10 Day Grand Tour",
                    status: "draft",
                    start_date: "2026-07-01"
                }
            ];

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const trips = await httpClient.fetchTrips();

            // Should normalize to our expected interface
            expect(trips).toHaveLength(2);
            expect(trips[0]).toMatchObject({
                uuid: '998076',
                name: "5 Day Ireland West & South"
            });
            expect(trips[1]).toMatchObject({
                uuid: '998080',
                name: "10 Day Grand Tour"
            });
        });

        test('prefers API uuid over numeric id when both are present', async () => {
            const apiResponse = [
                {
                    id: 77236795,
                    uuid: 'trip-77236795-uuid',
                    title: 'Tellus360 Ireland Trip - May 2022'
                }
            ];

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => apiResponse
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        id: 77236795,
                        uuid: 'trip-77236795-uuid',
                        title: 'Tellus360 Ireland Trip - May 2022',
                        start_date: '2026-05-01'
                    })
                });

            const trips = await httpClient.fetchTrips();

            expect(trips).toHaveLength(1);
            expect(trips[0]).toMatchObject({
                uuid: 'trip-77236795-uuid',
                name: 'Tellus360 Ireland Trip - May 2022',
                start_date: '2026-05-01'
            });
        });

        test('hydrates trip metadata from per-trip details when the list API omits dates and packages', async () => {
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => [
                        { uuid: 'trip-42', name: 'Trip 42' }
                    ]
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        uuid: 'trip-42',
                        name: 'Trip 42',
                        departure_date: '2026-05-09',
                        start_date: '2026-05-10',
                        packages: [{ id: 'package-99', start_date: '2026-05-11' }]
                    })
                });

            const trips = await httpClient.fetchTrips();

            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(trips[0]).toMatchObject({
                uuid: 'trip-42',
                name: 'Trip 42',
                departure_date: '2026-05-09',
                start_date: '2026-05-10',
                packages: [{ id: 'package-99', start_date: '2026-05-11' }]
            });
        });
    });

    describe('fetchTripBookings', () => {
        test('handles 404 error when trips endpoint does not exist', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => 'Not Found'
            });

            await expect(httpClient.fetchTripBookings('998076'))
                .rejects
                .toThrow('WeTravel API error: 404 Not Found');
        });

        test('fetches bookings from trip bookings endpoint', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: 123,
                        reference: 'WT-123',
                        buyer: {
                            email: "customer@example.com"
                        },
                        trip: {
                            title: "5 Day Ireland West & South"
                        },
                        created_at: "2026-06-13T02:24:59.000+00:00"
                    },
                    {
                        id: 124,
                        reference: 'WT-124',
                        buyer: {
                            email: "another@example.com"
                        },
                        trip: {
                            title: "5 Day Ireland West & South"
                        },
                        created_at: "2026-06-14T05:10:00.000+00:00"
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 2
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('54648412');

            // Should call /bookings/trips/{tripId}/bookings endpoint with query pagination
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.wetravel.com/v2/bookings/trips/54648412/bookings?page=1&per_page=100',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-access-token',
                        'Accept': 'application/json'
                    })
                })
            );

            // Should return normalized bookings
            expect(bookings).toHaveLength(2);
            expect(bookings[0]).toMatchObject({
                id: '123',
                buyer: {
                    email: 'customer@example.com'
                }
            });
        });

        test('normalizes numeric booking id into reference when explicit reference is missing', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: 2775611458,
                        buyer: {
                            email: 'customer@example.com'
                        }
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 1
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('54648412');

            expect(bookings).toHaveLength(1);
            expect(bookings[0].id).toBe('2775611458');
            expect(bookings[0].reference).toBe('2775611458');
            expect(bookings[0].product_name).toBe('WeTravel Booking');
        });

        test('prefers package start_date before trip departure/start and raw booking dates', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: 301,
                        reference: 'WT-301',
                        travel_date: '2026-07-20',
                        start_date: '2026-07-21',
                        order: {
                            package_id: 'package-9',
                            travel_date: '2026-07-12',
                            start_date: '2026-07-13'
                        },
                        trip: {
                            uuid: 'trip-1',
                            departure_date: '2026-07-25',
                            start_date: '2026-07-26',
                            packages: [{ id: 'package-9', start_date: '2026-07-15' }]
                        }
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 1
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('trip-1');

            expect(bookings[0].travel_date).toBe('2026-07-15');
            expect(bookings[0].start_date).toBe('2026-07-15');
        });

        test('uses trip departure_date when no package start_date matches', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: 302,
                        reference: 'WT-302',
                        travel_date: '2026-07-20',
                        order: {
                            travel_date: '2026-07-12',
                            start_date: '2026-07-13'
                        },
                        trip: {
                            uuid: 'trip-2',
                            departure_date: '2026-07-25',
                            start_date: '2026-07-26'
                        }
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 1
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('trip-2');

            expect(bookings[0].travel_date).toBe('2026-07-25');
        });

        test('uses trip start_date when no package or departure date is available', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: 303,
                        reference: 'WT-303',
                        travel_date: '2026-07-20',
                        order: {
                            travel_date: '2026-07-12'
                        },
                        trip: {
                            uuid: 'trip-3',
                            start_date: '2026-07-26'
                        }
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 1
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('trip-3');

            expect(bookings[0].travel_date).toBe('2026-07-26');
        });

        test('falls back to raw booking/order dates only when trip metadata is absent', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: 304,
                        reference: 'WT-304',
                        travel_date: '2026-07-20',
                        start_date: '2026-07-21',
                        order: {
                            travel_date: '2026-07-12',
                            start_date: '2026-07-13'
                        }
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 1
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('trip-4');

            expect(bookings[0].travel_date).toBe('2026-07-20');
        });

        test('extracts package ids from nested booking and order payload variants', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: 305,
                        reference: 'WT-305',
                        order: {
                            package: { id: 'pkg-order-nested' },
                            travel_date: '2026-07-12'
                        },
                        trip: {
                            uuid: 'trip-5',
                            packages: [{ id: 'pkg-order-nested', start_date: '2026-07-15' }]
                        }
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 1
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('trip-5');

            expect(bookings[0].travel_date).toBe('2026-07-15');
        });

        test('fetches buyer booking detail endpoint for participant enrichment', async () => {
            const apiResponse = {
                buyer_id: 2651160,
                participants: [
                    {
                        id: '2783882909382090752',
                        email: 'damianpmarshall@gmail.com',
                        first_name: 'Damian',
                        last_name: 'Marshall'
                    }
                ]
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const details = await httpClient.fetchTripBuyerBookingDetails('8794029971', '2651160');

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.wetravel.com/v2/bookings/trips/8794029971/bookings/2651160',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-access-token',
                        'Accept': 'application/json'
                    })
                })
            );
            expect(details).toMatchObject(apiResponse);
        });

        test('pulls booking product name from nested order option metadata and preserves nested buyer id', async () => {
            const apiResponse = {
                bookings: [
                    {
                        id: '2768666542781505536',
                        trip: {
                            uuid: '8794029971'
                        },
                        buyer: {
                            id: 2651160,
                            email: 'wpmwpm1@hotmail.com'
                        },
                        order: {
                            options: [
                                {
                                    name: 'Family Room'
                                }
                            ]
                        }
                    }
                ],
                pagination: {
                    page: 1,
                    per_page: 100,
                    total_count: 1
                }
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => apiResponse
            });

            const bookings = await httpClient.fetchTripBookings('8794029971');

            expect(bookings).toHaveLength(1);
            expect(bookings[0].reference).toBe('2768666542781505536');
            expect(bookings[0].product_name).toBe('Family Room');
            expect(bookings[0].trip_uuid).toBe('8794029971');
            expect(bookings[0].buyer_id).toBe('2651160');
        });
    });
});
