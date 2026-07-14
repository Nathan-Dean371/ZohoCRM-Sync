import axios from 'axios';
import VentrataWebhookService from '../services/ventrata/ventrata-webhook-service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VentrataWebhookService', () => {
    let webhookService: VentrataWebhookService;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.VENTRATA_API_KEY = 'test-api-key';
        webhookService = new VentrataWebhookService();
    });

    test('should create a webhook', async () => {
        const testUrl = 'https://webhook.site/your-test-id';
        mockedAxios.post.mockResolvedValue({
            data: {
                id: 'webhook-1',
                url: testUrl,
                event: 'booking_update'
            }
        } as any);

        const webhook = await webhookService.createWebhook(testUrl);

        expect(webhook).toBeDefined();
        expect(webhook.id).toBe('webhook-1');
        expect(webhook.url).toBe(testUrl);
        expect(webhook.event).toBe('booking_update');
    });
});