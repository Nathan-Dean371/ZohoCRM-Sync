import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('WeTravelImportJob booking sync schema', () => {
    let testCompanyId: string;
    let testJobId: string;

    beforeAll(async () => {
        // Use a test company ID (UUID format)
        testCompanyId = '00000000-0000-0000-0000-000000000001';
    });

    afterEach(async () => {
        // Clean up test data
        if (testJobId) {
            await prisma.weTravelImportJob.deleteMany({
                where: { id: testJobId }
            });
        }
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('new job creation', () => {
        it('includes bookings_processed and bookings_failed fields with default 0', async () => {
            const job = await prisma.weTravelImportJob.create({
                data: {
                    company_id: testCompanyId,
                    status: 'in_progress'
                }
            });

            testJobId = job.id;

            expect(job.bookings_processed).toBe(0);
            expect(job.bookings_failed).toBe(0);
            expect(job.contacts_processed).toBe(0);
            expect(job.contacts_failed).toBe(0);
        });
    });

    describe('booking progress tracking', () => {
        it('can update bookings_processed independently from contacts_processed', async () => {
            const job = await prisma.weTravelImportJob.create({
                data: {
                    company_id: testCompanyId,
                    status: 'in_progress',
                    contacts_processed: 10,
                    contacts_failed: 2
                }
            });

            testJobId = job.id;

            const updated = await prisma.weTravelImportJob.update({
                where: { id: job.id },
                data: {
                    bookings_processed: 25,
                    bookings_failed: 3
                }
            });

            expect(updated.bookings_processed).toBe(25);
            expect(updated.bookings_failed).toBe(3);
            expect(updated.contacts_processed).toBe(10);
            expect(updated.contacts_failed).toBe(2);
        });

        it('can track both contact and booking progress separately', async () => {
            const job = await prisma.weTravelImportJob.create({
                data: {
                    company_id: testCompanyId,
                    status: 'in_progress',
                    contacts_processed: 50,
                    contacts_failed: 5,
                    bookings_processed: 100,
                    bookings_failed: 10
                }
            });

            testJobId = job.id;

            const retrieved = await prisma.weTravelImportJob.findUnique({
                where: { id: job.id }
            });

            expect(retrieved).not.toBeNull();
            expect(retrieved!.contacts_processed).toBe(50);
            expect(retrieved!.contacts_failed).toBe(5);
            expect(retrieved!.bookings_processed).toBe(100);
            expect(retrieved!.bookings_failed).toBe(10);
        });
    });

    describe('migration compatibility', () => {
        it('existing job queries continue to work with new fields', async () => {
            const job = await prisma.weTravelImportJob.create({
                data: {
                    company_id: testCompanyId,
                    status: 'completed',
                    contacts_processed: 15,
                    contacts_failed: 1
                }
            });

            testJobId = job.id;

            // Should be able to query without specifying booking fields
            const allJobs = await prisma.weTravelImportJob.findMany({
                where: { company_id: testCompanyId }
            });

            expect(allJobs.length).toBeGreaterThan(0);
            const foundJob = allJobs.find(j => j.id === job.id);
            expect(foundJob).toBeDefined();
            expect(foundJob!.bookings_processed).toBe(0); // Default value
            expect(foundJob!.bookings_failed).toBe(0); // Default value
        });
    });
});
