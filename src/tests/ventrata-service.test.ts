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

    test('getBookings should fetch bookings for today', async () => {
        const today = '2026-07-09';
        mockedAxios.get.mockResolvedValue({
            data: [
                {
                    id: 'b-1',
                    status: 'CONFIRMED',
                    contact: { fullName: 'Test User' }
                }
            ]
        } as any);

        const bookings = await ventrataService.getBookings({ localDate: today });

        expect(Array.isArray(bookings)).toBe(true);
        expect(bookings).toHaveLength(1);
        expect(bookings[0]).toHaveProperty('id', 'b-1');
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
});