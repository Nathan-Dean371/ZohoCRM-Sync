import { PrismaClient } from '@prisma/client';
import VentrataService from './ventrata-service';
import VentrataWebhookHandler from './ventrata-webhook-handler';
import { ventrataWebhookQueue } from '../queue';

const prisma = new PrismaClient();

export interface VentrataImportJobStatus {
    id: string;
    companyId: string;
    status: 'in_progress' | 'completed' | 'failed';
    bookingDateStart: Date;
    bookingDateEnd: Date;
    currentPage: number;
    bookingsProcessed: number;
    bookingsFailed: number;
    missingContactCount: number;
    startedAt: Date;
    completedAt?: Date;
    failureDetails?: any;
}

export class VentrataHistoricBookingSyncService {
    constructor(
        private readonly ventrataService: VentrataService = new VentrataService(),
        private readonly webhookHandler: VentrataWebhookHandler = new VentrataWebhookHandler()
    ) {}

    /**
    * Starts a new historical Ventrata booking import job bounded by booking dates
     */
    async startImport(companyId: string, bookingDateStart: Date, bookingDateEnd: Date): Promise<VentrataImportJobStatus> {
        const job = await prisma.ventrataImportJob.create({
            data: {
                company_id: companyId,
                status: 'in_progress',
                booking_date_start: bookingDateStart,
                booking_date_end: bookingDateEnd,
                current_page: 1,
                bookings_processed: 0,
                bookings_failed: 0,
                missing_contact_count: 0
            }
        });

        await ventrataWebhookQueue.add('process-ventrata-import', {
            jobId: job.id
        });

        return this.mapJobToStatus(job);
    }

    /**
     * Processes the import job page by page with checkpoint persistence and resilience
     */
    async processImportJob(jobId: string): Promise<VentrataImportJobStatus> {
        const job = await prisma.ventrataImportJob.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            throw new Error(`Ventrata import job ${jobId} not found`);
        }

        if (job.status === 'completed') {
            return this.mapJobToStatus(job);
        }

        if (job.status !== 'in_progress') {
            await prisma.ventrataImportJob.update({
                where: { id: jobId },
                data: { status: 'in_progress' }
            });
        }

        const bookingDateStartStr = job.booking_date_start.toISOString().split('T')[0];
        const bookingDateEndStr = job.booking_date_end.toISOString().split('T')[0];

        let currentPage = job.current_page || 1;
        let bookingsProcessed = job.bookings_processed || 0;
        let bookingsFailed = job.bookings_failed || 0;
        let missingContactCount = job.missing_contact_count || 0;
        const failureDetails: any[] = Array.isArray(job.failure_details) ? (job.failure_details as any[]) : [];
        const pageSize = 50;

        try {
            while (true) {
                console.log(`[Ventrata Historic Import] Processing page ${currentPage} for job ${jobId}`);

                let bookings = [];
                try {
                    bookings = await this.ventrataService.getBookings({
                        page: currentPage,
                        limit: pageSize
                    });
                } catch (error: any) {
                    console.error(`[Ventrata Historic Import] Error fetching page ${currentPage}:`, error);
                    await prisma.ventrataImportJob.update({
                        where: { id: jobId },
                        data: {
                            status: 'failed',
                            current_page: currentPage,
                            bookings_processed: bookingsProcessed,
                            bookings_failed: bookingsFailed,
                            missing_contact_count: missingContactCount,
                            completed_at: new Date(),
                            failure_details: failureDetails.length > 0 ? failureDetails : undefined
                        }
                    });
                    throw error;
                }

                if (!bookings || bookings.length === 0) {
                    console.log(`[Ventrata Historic Import] No bookings found on page ${currentPage}. Completing job.`);
                    const updated = await prisma.ventrataImportJob.update({
                        where: { id: jobId },
                        data: {
                            status: 'completed',
                            current_page: currentPage,
                            bookings_processed: bookingsProcessed,
                            bookings_failed: bookingsFailed,
                            missing_contact_count: missingContactCount,
                            completed_at: new Date(),
                            failure_details: failureDetails.length > 0 ? failureDetails : undefined
                        }
                    });
                    return this.mapJobToStatus(updated);
                }

                const bookingsInDateRange = bookings.filter(booking => {
                    const bookingDate = booking.utcConfirmedAt?.slice(0, 10);
                    return bookingDate && bookingDate >= bookingDateStartStr && bookingDate <= bookingDateEndStr;
                });

                for (const booking of bookingsInDateRange) {
                    try {
                        const result = await this.webhookHandler.processBooking(booking);
                        bookingsProcessed++;
                        if (result.missingContact) {
                            missingContactCount++;
                        }
                    } catch (err: any) {
                        console.error(`[Ventrata Historic Import] Failed booking ${booking.uuid}:`, err);
                        bookingsFailed++;
                        failureDetails.push({
                            page: currentPage,
                            bookingUuid: booking.uuid,
                            error: err.message || String(err)
                        });
                    }
                }

                const hasMore = bookings.length >= pageSize;
                if (!hasMore) {
                    console.log(`[Ventrata Historic Import] Reached end of results on page ${currentPage}. Completing job.`);
                    const updated = await prisma.ventrataImportJob.update({
                        where: { id: jobId },
                        data: {
                            status: 'completed',
                            current_page: currentPage,
                            bookings_processed: bookingsProcessed,
                            bookings_failed: bookingsFailed,
                            missing_contact_count: missingContactCount,
                            completed_at: new Date(),
                            failure_details: failureDetails.length > 0 ? failureDetails : undefined
                        }
                    });
                    return this.mapJobToStatus(updated);
                }

                currentPage++;
                await prisma.ventrataImportJob.update({
                    where: { id: jobId },
                    data: {
                        current_page: currentPage,
                        bookings_processed: bookingsProcessed,
                        bookings_failed: bookingsFailed,
                        missing_contact_count: missingContactCount,
                        failure_details: failureDetails.length > 0 ? failureDetails : undefined
                    }
                });
            }
        } catch (error) {
            console.error(`[Ventrata Historic Import] Job ${jobId} failed:`, error);
            throw error;
        }
    }

    /**
     * Returns job status by ID
     */
    async getImportStatus(jobId: string): Promise<VentrataImportJobStatus | null> {
        const job = await prisma.ventrataImportJob.findUnique({
            where: { id: jobId }
        });

        return job ? this.mapJobToStatus(job) : null;
    }

    /**
     * Returns the latest import job for a company
     */
    async getLatestImportJob(companyId: string): Promise<VentrataImportJobStatus | null> {
        const job = await prisma.ventrataImportJob.findFirst({
            where: { company_id: companyId },
            orderBy: { started_at: 'desc' }
        });

        return job ? this.mapJobToStatus(job) : null;
    }

    private mapJobToStatus(job: any): VentrataImportJobStatus {
        return {
            id: job.id,
            companyId: job.company_id,
            status: job.status,
            bookingDateStart: job.booking_date_start,
            bookingDateEnd: job.booking_date_end,
            currentPage: job.current_page,
            bookingsProcessed: job.bookings_processed,
            bookingsFailed: job.bookings_failed,
            missingContactCount: job.missing_contact_count,
            startedAt: job.started_at,
            completedAt: job.completed_at || undefined,
            failureDetails: job.failure_details || undefined
        };
    }
}
