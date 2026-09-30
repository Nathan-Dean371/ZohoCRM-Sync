import axios from 'axios';
import VentrataService from '../services/ventrata/ventrata-service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VentrataService', () => {
    let ventrataService: VentrataService;

    beforeEach(() => {
        jest.clearAllMocks();
        ventrataService = new VentrataService('test-api-key');
    });

    test('getBookings should fetch bookings with date range and page parameters', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [
                {
                    id: 'b-1',
                    status: 'CONFIRMED',
                    contact: { fullName: 'Test User' }
                }
            ]
        } as any);

        const bookings = await ventrataService.getBookings({
            localDateStart: '2026-01-01',
            localDateEnd: '2026-01-31',
            page: 2,
            limit: 50
        });

        expect(Array.isArray(bookings)).toBe(true);
        expect(bookings).toHaveLength(1);
        expect(mockedAxios.get).toHaveBeenCalledWith(
            'https://api.ventrata.com/octo/bookings',
            expect.objectContaining({
                params: {
                    localDateStart: '2026-01-01',
                    localDateEnd: '2026-01-31',
                    page: 2,
                    limit: 50
                }
            })
        );
    });

    test('getWebhooks should return array of registered webhooks', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{ id: 'wh-1', url: 'https://example.com/webhook' }]
        } as any);

        const webhooks = await ventrataService.getWebhooks();

        expect(webhooks).toHaveLength(1);
        expect(webhooks[0].url).toBe('https://example.com/webhook');
    });

    test('registerWebhook should check existing webhooks and send X-Webhook-Secret header if missing', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] } as any);
        mockedAxios.post.mockResolvedValue({ data: { id: 'wh-new', url: 'https://example.com/webhook' } } as any);

        const result = await ventrataService.registerWebhook('https://example.com/webhook', 'my-secret-123');

        expect(result.id).toBe('wh-new');
        expect(mockedAxios.post).toHaveBeenCalledWith(
            'https://api.ventrata.com/octo/webhooks',
            {
                url: 'https://example.com/webhook',
                event: 'booking_update',
                headers: {
                    'X-Webhook-Secret': 'my-secret-123'
                }
            },
            expect.anything()
        );
    });

    test('registerWebhook should return existing webhook if already registered', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{ id: 'wh-existing', url: 'https://example.com/webhook' }]
        } as any);

        const result = await ventrataService.registerWebhook('https://example.com/webhook', 'my-secret-123');

        expect(result.id).toBe('wh-existing');
        expect(mockedAxios.post).not.toHaveBeenCalled();
    });
});