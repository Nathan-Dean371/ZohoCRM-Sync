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
            // TRACER BULLET: Verify we're calling the right endpoint per WeTravel API docs
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => []
            });

            await httpClient.fetchTrips();

            // WeTravel API uses /v2/draft_trips for listing trips
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
            // RED: WeTravel API returns trips with 'id' and 'title' fields,
            // but our interface expects 'uuid' and 'name'
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
    });

    describe('fetchBookings', () => {
        test('handles 404 error when trips endpoint does not exist', async () => {
            // RED: /trips/{id}/bookings returns 404, need to find correct endpoint
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: async () => 'Not Found'
            });

            await expect(httpClient.fetchBookings('998076'))
                .rejects
                .toThrow('WeTravel API error: 404 Not Found');
        });

        test('fetches bookings using leads endpoint with is_booked filter', async () => {
            // RED: Should use /lead endpoint with is_booked=true and trip_uuids filter
            // instead of /trips/{id}/bookings which doesn't exist
            const apiResponse = {
                leads: [
                    {
                        id: 123,
                        trip_uuid: "54648412",
                        email: "customer@example.com",
                        is_booked: true,
                        trip: {
                            title: "5 Day Ireland West & South"
                        },
                        created_at: "2026-06-13T02:24:59.000+00:00"
                    },
                    {
                        id: 124,
                        trip_uuid: "54648412",
                        email: "another@example.com",
                        is_booked: true,
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

            const bookings = await httpClient.fetchBookings('54648412');

            // Should call /lead endpoint with correct filters
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.wetravel.com/v2/lead',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-access-token',
                        'Content-Type': 'application/json'
                    }),
                    body: expect.stringContaining('"trip_uuids":["54648412"]')
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
    });
});
