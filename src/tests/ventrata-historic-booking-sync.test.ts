const mockImportJob = {
    findUnique: jest.fn(),
    update: jest.fn()
};

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => ({ ventrataImportJob: mockImportJob }))
}));

jest.mock('../services/queue', () => ({
    ventrataWebhookQueue: { add: jest.fn() }
}));

jest.mock('../services/ventrata/ventrata-webhook-handler', () => jest.fn());

import { VentrataHistoricBookingSyncService } from '../services/ventrata/ventrata-historic-booking-sync-service';

describe('VentrataHistoricBookingSyncService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('filters the requested range by booking confirmation date, not travel date', async () => {
        const job = {
            id: 'job-1',
            company_id: 'company-1',
            status: 'in_progress',
            booking_date_start: new Date('2026-10-01T00:00:00.000Z'),
            booking_date_end: new Date('2026-10-02T00:00:00.000Z'),
            current_page: 1,
            bookings_processed: 0,
            bookings_failed: 0,
            missing_contact_count: 0,
            started_at: new Date('2026-10-01T00:00:00.000Z'),
            completed_at: null,
            failure_details: null
        };
        mockImportJob.findUnique.mockResolvedValue(job);
        mockImportJob.update.mockImplementation(({ data }) => Promise.resolve({ ...job, ...data }));

        const getBookings = jest.fn().mockResolvedValue([
            { uuid: 'confirmed-in-range', utcConfirmedAt: '2026-10-02T09:00:00.000Z', availability: { localDateTimeStart: '2027-04-01' } },
            { uuid: 'confirmed-out-of-range', utcConfirmedAt: '2026-10-03T09:00:00.000Z', availability: { localDateTimeStart: '2026-10-01' } }
        ]);
        const processBooking = jest.fn().mockResolvedValue({ missingContact: false });
        const service = new VentrataHistoricBookingSyncService(
            { getBookings } as any,
            { processBooking } as any
        );

        const result = await service.processImportJob('job-1');

        expect(getBookings).toHaveBeenCalledWith({ page: 1, limit: 50 });
        expect(processBooking).toHaveBeenCalledTimes(1);
        expect(processBooking).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'confirmed-in-range' }));
        expect(result.bookingsProcessed).toBe(1);
        expect(result.bookingDateStart).toEqual(job.booking_date_start);
        expect(result.bookingDateEnd).toEqual(job.booking_date_end);
    });
});