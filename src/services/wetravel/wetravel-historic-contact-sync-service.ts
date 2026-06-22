import type ZohoCRMService from '../zoho/zoho-crm-service';
import type { WeTravelTokenManager } from '../integrations/wetravel-token-manager';
import type { IdempotencyService } from '../database/idempotency-service';
import type { ZohoVentrataBooking } from '../../types/zoho';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface WeTravelTrip {
    uuid: string;
    name: string;
}

export interface WeTravelBooking {
    id: string;
    reference?: string;
    product_name?: string;
    travel_date?: string;
    start_date?: string;
    created_at?: string;
    buyer: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
        country?: string;
    };
}

export interface WeTravelApiClient {
    fetchTrips(): Promise<WeTravelTrip[]>;
    fetchBookings(tripUuid: string): Promise<WeTravelBooking[]>;
    fetchLeads?(options?: {
        trip_uuids?: string[];
        is_booked?: boolean;
        page?: number;
        per_page?: 25 | 50 | 100;
    }): Promise<{ leads: any[]; pagination: any }>;
}

export interface ImportStatus {
    id?: string;
    status: 'completed' | 'in_progress' | 'failed';
    contactsProcessed: number;
    contactsFailed: number;
    bookingsProcessed: number;
    bookingsFailed: number;
    startedAt?: Date;
    completedAt?: Date;
    errorMessage?: string;
}

export interface NormalizedContact {
    First_Name: string;
    Last_Name: string;
    Email: string | null;
    Phone: string | null;
    Country: string | null;
}

export class WeTravelHistoricContactSyncService {
    constructor(
        private readonly weTravelClient: WeTravelApiClient,
        private readonly zohoService: ZohoCRMService,
        private readonly tokenManager: WeTravelTokenManager,
        private readonly idService: IdempotencyService
    ) {}

    async startImport(companyId: string): Promise<ImportStatus> {
        // Create import job record
        const job = await prisma.weTravelImportJob.create({
            data: {
                company_id: companyId,
                status: 'in_progress',
                contacts_processed: 0,
                contacts_failed: 0
            }
        });

        try {
            // Use the leads endpoint if available (more comprehensive)
            if (this.weTravelClient.fetchLeads) {
                console.log('Fetching contacts from WeTravel /lead endpoint...');
                const leads = await this.weTravelClient.fetchLeads();
                console.log(`Fetched ${leads.length} leads from WeTravel`);

                // Convert leads to normalized contacts
                const uniqueContacts = this.normalizeLeads(leads);
                console.log(`Extracted ${uniqueContacts.length} unique contacts to sync to Zoho`);

                // Track synced contacts with their Zoho IDs (keyed by email/phone)
                const contactIdMap = new Map<string, string>();
                
                // Upsert each contact to Zoho
                let contactsProcessed = 0;
                let contactsFailed = 0;

                for (const contact of uniqueContacts) {
                    try {
                        const zohoContact = await this.zohoService.upsertContact(contact);
                        contactsProcessed++;
                        console.log(`✓ Synced contact: ${contact.First_Name} ${contact.Last_Name} (${contact.Email})`);
                        
                        // Store mapping for booking sync
                        const contactKey = contact.Email?.toLowerCase() || `phone:${contact.Phone}`;
                        if (zohoContact.id) {
                            contactIdMap.set(contactKey, zohoContact.id);
                        }
                    } catch (error) {
                        console.error('Failed to upsert contact:', error);
                        contactsFailed++;
                    }
                }

                // Now sync bookings: fetch all trips and bookings
                console.log('Fetching trips and bookings for booking sync...');
                const trips = await this.weTravelClient.fetchTrips();
                console.log(`Fetched ${trips.length} trips from WeTravel`);
                
                const allBookings: WeTravelBooking[] = [];
                for (const trip of trips) {
                    console.log(`Fetching bookings for trip: ${trip.uuid} (${trip.name})`);
                    const bookings = await this.weTravelClient.fetchBookings(trip.uuid);
                    console.log(`  Found ${bookings.length} bookings`);
                    allBookings.push(...bookings);
                }
                
                console.log(`Total bookings across all trips: ${allBookings.length}`);
                
                // Sync bookings to Zoho
                let bookingsProcessed = 0;
                let bookingsFailed = 0;
                
                for (const booking of allBookings) {
                    try {
                        // Find the corresponding contact by email or phone
                        const bookingKey = booking.buyer.email?.toLowerCase() || `phone:${booking.buyer.phone}`;
                        const contactId = contactIdMap.get(bookingKey);
                        
                        if (!contactId) {
                            console.log(`Skipping booking ${booking.id} - contact not found in sync`);
                            bookingsFailed++;
                            continue;
                        }
                        
                        // Skip bookings without required fields
                        if (!booking.reference || !booking.product_name) {
                            console.log(`Skipping booking ${booking.id} - missing required fields`);
                            bookingsFailed++;
                            continue;
                        }
                        
                        const normalizedBooking = this.normalizeBooking(booking, contactId);
                        const zohoBooking = await this.zohoService.upsertBooking(normalizedBooking);
                        
                        // Track in idempotency map
                        if (zohoBooking.id) {
                            await this.idService.saveMapping(
                                booking.reference,
                                zohoBooking.id
                            );
                        }
                        
                        bookingsProcessed++;
                        console.log(`✓ Synced booking: ${booking.reference} for contact ${booking.buyer.email}`);
                    } catch (error) {
                        console.error(`Failed to sync booking ${booking.id}:`, error);
                        bookingsFailed++;
                    }
                }

                // Update job as completed
                const updatedJob = await prisma.weTravelImportJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'completed',
                        contacts_processed: contactsProcessed,
                        contacts_failed: contactsFailed,
                        bookings_processed: bookingsProcessed,
                        bookings_failed: bookingsFailed,
                        completed_at: new Date()
                    }
                });

                return {
                    id: updatedJob.id,
                    status: 'completed',
                    contactsProcessed,
                    contactsFailed,
                    bookingsProcessed,
                    bookingsFailed,
                    startedAt: updatedJob.started_at,
                    completedAt: updatedJob.completed_at ?? undefined
                };
            }

            // Fallback: Fetch all trips and bookings (legacy approach)
            const trips = await this.weTravelClient.fetchTrips();
            console.log(`Fetched ${trips.length} trips from WeTravel`);

            // Fetch bookings for each trip
            const allBookings: WeTravelBooking[] = [];
            for (const trip of trips) {
                console.log(`Fetching bookings for trip: ${trip.uuid} (${trip.name})`);
                const bookings = await this.weTravelClient.fetchBookings(trip.uuid);
                console.log(`  Found ${bookings.length} bookings`);
                allBookings.push(...bookings);
            }

            console.log(`Total bookings across all trips: ${allBookings.length}`);

            // Extract and deduplicate contacts by email
            const uniqueContacts = this.deduplicateContacts(allBookings);
            console.log(`Extracted ${uniqueContacts.length} unique contacts to sync to Zoho`);

            // Upsert each contact and their bookings to Zoho
            let contactsProcessed = 0;
            let contactsFailed = 0;
            let bookingsProcessed = 0;
            let bookingsFailed = 0;

            for (const contact of uniqueContacts) {
                try {
                    const zohoContact = await this.zohoService.upsertContact(contact);
                    contactsProcessed++;
                    console.log(`✓ Synced contact: ${contact.First_Name} ${contact.Last_Name} (${contact.Email})`);

                    // Find all bookings for this contact
                    const contactKey = contact.Email?.toLowerCase() || `phone:${contact.Phone}`;
                    const contactBookings = allBookings.filter(booking => {
                        const bookingKey = booking.buyer.email?.toLowerCase() || `phone:${booking.buyer.phone}`;
                        return bookingKey === contactKey;
                    });

                    // Sync all bookings for this contact
                    for (const booking of contactBookings) {
                        // Skip bookings without required fields
                        if (!booking.reference || !booking.product_name) {
                            console.log(`Skipping booking ${booking.id} - missing required fields`);
                            bookingsFailed++;
                            continue;
                        }
                        
                        try {
                            const normalizedBooking = this.normalizeBooking(booking, zohoContact.id!);
                            const zohoBooking = await this.zohoService.upsertBooking(normalizedBooking);
                            
                            // Track in idempotency map
                            await this.idService.saveMapping(
                                booking.reference,
                                zohoBooking.id!
                            );
                            
                            bookingsProcessed++;
                            console.log(`✓ Synced booking: ${booking.reference} for contact ${contact.Email}`);
                        } catch (error) {
                            console.error(`Failed to sync booking ${booking.reference}:`, error);
                            bookingsFailed++;
                        }
                    }
                } catch (error) {
                    console.error('Failed to upsert contact:', error);
                    contactsFailed++;
                }
            }

            // Update job as completed
            const updatedJob = await prisma.weTravelImportJob.update({
                where: { id: job.id },
                data: {
                    status: 'completed',
                    contacts_processed: contactsProcessed,
                    contacts_failed: contactsFailed,
                    bookings_processed: bookingsProcessed,
                    bookings_failed: bookingsFailed,
                    completed_at: new Date()
                }
            });

            return {
                id: updatedJob.id,
                status: 'completed',
                contactsProcessed,
                contactsFailed,
                bookingsProcessed,
                bookingsFailed,
                startedAt: updatedJob.started_at,
                completedAt: updatedJob.completed_at ?? undefined
            };
        } catch (error) {
            // Update job as failed
            await prisma.weTravelImportJob.update({
                where: { id: job.id },
                data: {
                    status: 'failed',
                    error_message: error instanceof Error ? error.message : 'Unknown error',
                    completed_at: new Date()
                }
            });

            console.error('Import failed:', error);
            throw error;
        }
    }

    async getImportStatus(jobId: string): Promise<ImportStatus | null> {
        const job = await prisma.weTravelImportJob.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            return null;
        }

        return {
            id: job.id,
            status: job.status as 'completed' | 'in_progress' | 'failed',
            contactsProcessed: job.contacts_processed,
            contactsFailed: job.contacts_failed,
            bookingsProcessed: job.bookings_processed,
            bookingsFailed: job.bookings_failed,
            startedAt: job.started_at,
            completedAt: job.completed_at ?? undefined,
            errorMessage: job.error_message ?? undefined
        };
    }

    private normalizeLeads(leads: any[]): NormalizedContact[] {
        const contactMap = new Map<string, NormalizedContact>();

        for (const lead of leads) {
            // Extract contact info from WeTravel lead
            const email = lead.email || null;
            const phone = lead.phone || null;
            const name = lead.name || '';
            
            // Split name into first and last
            const nameParts = name.trim().split(/\s+/);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || 'Unknown';

            const normalized: NormalizedContact = {
                First_Name: firstName,
                Last_Name: lastName,
                Email: email,
                Phone: phone,
                Country: null // WeTravel leads don't always have country in the base response
            };

            // Deduplicate by email or phone
            const key = email?.toLowerCase() || `phone:${phone}` || `lead:${lead.id}`;
            
            if (!contactMap.has(key)) {
                contactMap.set(key, normalized);
            }
        }

        return Array.from(contactMap.values());
    }

    private deduplicateContacts(bookings: WeTravelBooking[]): NormalizedContact[] {
        const contactMap = new Map<string, NormalizedContact>();

        for (const booking of bookings) {
            const normalized = this.normalizeContact(booking.buyer);
            const key = normalized.Email?.toLowerCase() || `phone:${normalized.Phone}`;

            // Only add if not already present (first occurrence wins)
            if (!contactMap.has(key)) {
                contactMap.set(key, normalized);
            }
        }

        return Array.from(contactMap.values());
    }

    private normalizeContact(buyer: WeTravelBooking['buyer']): NormalizedContact {
        return {
            First_Name: buyer.first_name || '',
            Last_Name: buyer.last_name || 'Unknown',
            Email: buyer.email || null,
            Phone: buyer.phone || null,
            Country: buyer.country || null
        };
    }

    private normalizeBooking(booking: WeTravelBooking, contactId: string): Omit<ZohoVentrataBooking, 'id'> {
        // Extract date from ISO timestamp or use as-is
        const bookingDate = booking.created_at?.split('T')[0] || '';
        
        return {
            Booking_Ref: booking.reference || '',
            Name: booking.product_name || '',
            Contact_Id: contactId,
            Product: booking.product_name || '',
            Travel_Date: booking.travel_date || '',
            Booking_Date: bookingDate
        };
    }
}
