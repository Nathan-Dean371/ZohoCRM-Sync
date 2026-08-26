import type ZohoCRMService from '../zoho/zoho-crm-service';
import type { WeTravelTokenManager } from '../integrations/wetravel-token-manager';
import type { IdempotencyService } from '../database/idempotency-service';
import type { ZohoVentrataBooking } from '../../types/zoho';
import { PrismaClient } from '@prisma/client';
import { formatDateTimeForZoho } from '../../utils/dateFormatter';

const prisma = new PrismaClient();

export interface WeTravelTripPackage {
    id?: string | number;
    start_date?: string;
    end_date?: string;
    title?: string;
    name?: string;
}

export interface WeTravelTrip {
    uuid: string;
    name: string;
    currency?: string;
    start_date?: string;
    end_date?: string;
    departure_date?: string;
    packages?: WeTravelTripPackage[];
}

export interface WeTravelBooking {
    id: string;
    reference?: string;
    trip_uuid?: string;
    buyer_id?: string | number;
    package_id?: string | number;
    resolved_package_id?: string | number;
    product_name?: string;
    travel_date?: string;
    start_date?: string;
    created_at?: string;
    amount?: number | string;
    total_amount?: number | string;
    paid_amount?: number | string;
    currency?: string;
    currency_code?: string;
    buyer: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
        country?: string;
    };
}

interface WeTravelBookingParticipant {
    id?: string | number;
    order_id?: string | number;
    option_id?: string | number;
    email?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    title?: string;
    product_name?: string;
    productName?: string;
    order_name?: string;
    option_name?: string;
    cancelled?: boolean;
    total_amount?: number | string;
    survey?: Array<{
        type?: string;
        question?: string;
        answers?: unknown[];
    }>;
}

interface WeTravelTripBuyerBookingDetails {
    participants?: WeTravelBookingParticipant[];
    orders?: Array<{
        id?: string | number;
        name?: string;
        title?: string;
        product_name?: string;
        options?: Array<{
            id?: string | number;
            name?: string;
            title?: string;
            product_name?: string;
            participants?: WeTravelBookingParticipant[];
        }>;
        participants?: WeTravelBookingParticipant[];
    }>;
}

export interface WeTravelApiClient {
    fetchTrips(): Promise<WeTravelTrip[]>;
    fetchTripBookings(tripUuid: string): Promise<WeTravelBooking[]>;
    fetchBookings?(tripUuid: string): Promise<WeTravelBooking[]>;
    fetchTripBuyerBookingDetails?(tripUuid: string, buyerId: string): Promise<WeTravelTripBuyerBookingDetails | null>;
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
    Mobile: string | null;
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
            const contactIdMap = new Map<string, string>();
            let contactsProcessed = 0;
            let contactsFailed = 0;
            let bookingsProcessed = 0;
            let bookingsFailed = 0;
            let leadsFetched = 0;
            let uniqueContactsCount = 0;
            const failedContactKeys = new Set<string>();

            if (this.weTravelClient.fetchLeads) {
                console.log('Fetching contacts from WeTravel /lead endpoint...');
                const leads = await this.fetchAllLeads({
                    per_page: 100
                });
                leadsFetched = leads.length;
                console.log(`Fetched ${leadsFetched} total leads from WeTravel across all pages`);

                const uniqueContacts = this.normalizeLeads(leads);
                uniqueContactsCount = uniqueContacts.length;
                console.log(`Extracted ${uniqueContactsCount} unique contacts to sync to Zoho`);

                for (const contact of uniqueContacts) {
                    try {
                        const zohoContact = await this.zohoService.upsertContact(contact);
                        contactsProcessed++;
                        console.log(`✓ Synced contact: ${contact.First_Name} ${contact.Last_Name} (${contact.Email})`);

                        const contactKey = this.getContactKey({ email: contact.Email, phone: contact.Phone });
                        if (zohoContact.id) {
                            contactIdMap.set(contactKey, zohoContact.id);
                        }
                    } catch (error) {
                        console.error('Failed to upsert contact:', error);
                        const contactKey = this.getContactKey({ email: contact.Email, phone: contact.Phone });
                        failedContactKeys.add(contactKey);
                        contactsFailed++;
                    }
                }
            }

            const trips = (await this.weTravelClient.fetchTrips()) || [];
            console.log(`Fetched ${trips.length} trips from WeTravel`);
            
            // Build trip map for enrichment during booking normalization
            const tripMap = new Map<string, WeTravelTrip>();
            for (const trip of trips) {
                tripMap.set(trip.uuid, trip);
            }

            const rawBookings: WeTravelBooking[] = [];
            for (const trip of trips) {
                console.log(`Fetching bookings for trip: ${trip.uuid} (${trip.name})`);
                try {
                    const tripBookings = await this.fetchTripBookingsForTrip(trip.uuid);
                    console.log(`  Found ${tripBookings.length} bookings`);
                    
                    // Enrich bookings with trip name only when it is a meaningful product fallback.
                    for (const booking of tripBookings) {
                        if (
                            (!booking.product_name || booking.product_name === 'WeTravel Booking') &&
                            trip.name && trip.name.trim().length > 0
                        ) {
                            booking.product_name = trip.name;
                            console.log(`  Enriched booking ${booking.id} with trip name: ${booking.product_name}`);
                        }

                        // The trip-bookings list endpoint does not return a currency; fall back to the trip's currency.
                        if (!booking.currency && !booking.currency_code && trip.currency) {
                            booking.currency = trip.currency;
                        }
                    }
                    rawBookings.push(...tripBookings);
                } catch (error) {
                    if (this.isNotFoundError(error)) {
                        console.warn(
                            `Skipping trip ${trip.uuid} (${trip.name}) - bookings endpoint returned 404 Not Found`
                        );
                        continue;
                    }

                    throw error;
                }
            }

            // Resilience fallback: if trip discovery returns nothing but lead access is available,
            // pull booked leads so bookings are not silently missed.
            if (rawBookings.length === 0 && this.weTravelClient.fetchLeads) {
                const tripUuids = trips
                    .map((trip) => (typeof trip.uuid === 'string' ? trip.uuid.trim() : ''))
                    .filter((uuid) => uuid.length > 0);

                let bookedLeads: any[] = [];

                if (tripUuids.length > 0) {
                    bookedLeads = await this.fetchAllLeads({
                        trip_uuids: tripUuids,
                        is_booked: true,
                        per_page: 100
                    });

                    if (bookedLeads.length === 0) {
                        console.log('No booked leads returned with trip_uuids filter; retrying without trip filter');
                    }
                }

                if (bookedLeads.length === 0) {
                    bookedLeads = await this.fetchAllLeads({
                        is_booked: true,
                        per_page: 100
                    });
                }

                rawBookings.push(...bookedLeads.map((lead) => this.mapLeadToBooking(lead)));
            }

            const allBookings = this.deduplicateBookings(rawBookings);
            const bookingsForSync = await this.expandBookingsWithParticipants(allBookings);
            if (uniqueContactsCount === 0) {
                const uniqueContacts = this.deduplicateContacts(bookingsForSync);
                uniqueContactsCount = uniqueContacts.length;

                // Legacy behavior: when lead pre-sync is unavailable, upsert unique contacts first.
                for (const contact of uniqueContacts) {
                    try {
                        const zohoContact = await this.zohoService.upsertContact(contact);
                        contactsProcessed++;

                        if (zohoContact.id) {
                            const contactKey = this.getContactKey({
                                email: contact.Email,
                                phone: contact.Phone
                            });
                            contactIdMap.set(contactKey, zohoContact.id);
                        }
                    } catch (error) {
                        console.error('Failed to upsert contact:', error);
                        const contactKey = this.getContactKey({
                            email: contact.Email,
                            phone: contact.Phone
                        });
                        failedContactKeys.add(contactKey);
                        contactsFailed++;
                    }
                }
            }

            console.log(`Fetched ${allBookings.length} total unique bookings from WeTravel trips`);
            console.log(`Expanded to ${bookingsForSync.length} participant-aware bookings for sync`);

            for (const booking of bookingsForSync) {
                try {
                    if (!booking.reference || !booking.product_name) {
                        console.log(`Skipping booking ${booking.id} - missing required fields`);
                        bookingsFailed++;
                        continue;
                    }

                    const bookingContact = this.normalizeContact(booking.buyer);
                    console.log('Booking contact normalized:', {
                        bookingRef: booking.reference,
                        contactFirstName: bookingContact.First_Name,
                        contactLastName: bookingContact.Last_Name,
                        contactEmail: bookingContact.Email,
                        contactPhone: bookingContact.Phone,
                        contactMobile: bookingContact.Mobile
                    });
                    
                    const bookingKey = this.getContactKey({
                        email: booking.buyer.email,
                        phone: booking.buyer.phone,
                        fallbackId: booking.id
                    });

                    let contactId = contactIdMap.get(bookingKey);

                    if (!contactId) {
                        if (failedContactKeys.has(bookingKey)) {
                            continue;
                        }

                        try {
                            const zohoContact = await this.zohoService.upsertContact(bookingContact);

                            if (!zohoContact.id) {
                                throw new Error('Zoho contact upsert did not return an ID');
                            }

                            contactId = zohoContact.id;
                            contactIdMap.set(bookingKey, contactId);
                            contactsProcessed++;
                            console.log(`Created missing contact for booking ${booking.id}`);
                        } catch (error) {
                            console.error(`Failed to create contact for booking ${booking.id}:`, error);
                            failedContactKeys.add(bookingKey);
                            contactsFailed++;
                            continue;
                        }
                    } else if (this.weTravelClient.fetchLeads && this.shouldEnrichContact(bookingContact)) {
                        // Keep lead-first imports enriched using richer booking payload buyer details.
                        try {
                            await this.zohoService.upsertContact(bookingContact);
                        } catch (error) {
                            console.error(`Failed to enrich contact for booking ${booking.id}:`, error);
                        }
                    }

                    const normalizedBooking = this.normalizeBooking(booking, contactId);
                    const zohoBooking = await this.zohoService.upsertBooking(normalizedBooking);

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

            this.logImportSummary({
                mode: 'trip-bookings',
                leadsFetched,
                uniqueContacts: uniqueContactsCount,
                contactsProcessed,
                contactsFailed,
                bookedLeadsFetched: allBookings.length,
                uniqueBookings: bookingsForSync.length,
                bookingsProcessed,
                bookingsFailed,
                tripsFetched: trips.length
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
            const leadContact = this.extractLeadContact(lead);
            const email = leadContact.email;
            const phone = leadContact.phone;
            const firstNameRaw = leadContact.firstName;
            const lastNameRaw = leadContact.lastName;
            const fullName = leadContact.fullName || '';

            // Split full name only when explicit first/last names are not provided.
            const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
            const firstName = firstNameRaw || nameParts[0] || '';
            const lastName = lastNameRaw || nameParts.slice(1).join(' ') || 'Unknown';

            const country = leadContact.country;

            const normalized: NormalizedContact = {
                First_Name: firstName,
                Last_Name: lastName,
                Email: email,
                Phone: phone,
                Mobile: phone,
                Country: country
            };

            if (!firstName && lastName === 'Unknown') {
                const leadId = this.pickFirstString(String(lead.id || ''), String(lead.uuid || '')) || 'unknown';
                console.log(
                    `[WeTravel Historic Sync] Contact name unresolved for lead ${leadId} (${email || 'no-email'}). ` +
                    `Top-level keys: ${Object.keys(lead || {}).slice(0, 30).join(', ')}`
                );
            }

            // Deduplicate by email or phone
            const key = this.getContactKey({ email, phone, fallbackId: String(lead.id || '') });
            
            const existing = contactMap.get(key);
            if (!existing) {
                contactMap.set(key, normalized);
                continue;
            }

            contactMap.set(key, this.mergeContacts(existing, normalized));
        }

        return Array.from(contactMap.values());
    }

    private deduplicateContacts(bookings: WeTravelBooking[]): NormalizedContact[] {
        const contactMap = new Map<string, NormalizedContact>();

        for (const booking of bookings) {
            const normalized = this.normalizeContact(booking.buyer);
            const key = this.getContactKey({ email: normalized.Email, phone: normalized.Phone, fallbackId: booking.id });

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
            Mobile: buyer.phone || null,
            Country: buyer.country || null
        };
    }

    private shouldEnrichContact(contact: NormalizedContact): boolean {
        const hasName =
            (contact.First_Name && contact.First_Name.trim().length > 0) ||
            (contact.Last_Name && contact.Last_Name !== 'Unknown');
        const hasPhone = !!contact.Phone;
        const hasCountry = !!contact.Country;

        return hasName || hasPhone || hasCountry;
    }

    private mapLeadToBooking(lead: any): WeTravelBooking {
        const trip = lead.trip || {};
        const bookingRef = lead.reference || lead.booking_reference || lead.supplierReference || lead.id;
        const productName = lead.product_name || trip.title || trip.name || 'WeTravel Booking';
        
        console.log('Mapping lead to booking:', {
            leadId: lead.id,
            leadKeys: Object.keys(lead).slice(0, 20),
            leadProductName: lead.product_name,
            tripTitle: trip.title,
            tripName: trip.name,
            finalProductName: productName
        });
        const buyerContact = this.extractLeadContact(lead);

        return {
            id: String(lead.id),
            reference: bookingRef ? String(bookingRef) : undefined,
            product_name: productName,
            travel_date: lead.travel_date || lead.start_date || trip.start_date,
            start_date: lead.start_date || trip.start_date,
            created_at: lead.created_at || lead.requested_at,
            amount: lead.amount,
            total_amount: lead.total_amount,
            paid_amount: lead.paid_amount,
            currency: lead.currency,
            currency_code: lead.currency_code,
            buyer: {
                first_name: buyerContact.firstName || undefined,
                last_name: buyerContact.lastName || undefined,
                email: buyerContact.email || undefined,
                phone: buyerContact.phone || undefined,
                country: buyerContact.country || undefined
            }
        };
    }

    private extractLeadContact(lead: any): {
        firstName: string | null;
        lastName: string | null;
        fullName: string | null;
        email: string | null;
        phone: string | null;
        country: string | null;
    } {
        const candidateEntities = this.getLeadContactCandidates(lead);

        const firstName = this.pickFirstString(
            ...candidateEntities.map((entity) => entity?.first_name),
            ...candidateEntities.map((entity) => entity?.firstName),
            ...candidateEntities.map((entity) => entity?.given_name),
            ...candidateEntities.map((entity) => entity?.givenName)
        );

        const lastName = this.pickFirstString(
            ...candidateEntities.map((entity) => entity?.last_name),
            ...candidateEntities.map((entity) => entity?.lastName),
            ...candidateEntities.map((entity) => entity?.family_name),
            ...candidateEntities.map((entity) => entity?.familyName),
            ...candidateEntities.map((entity) => entity?.surname)
        );

        const fullName = this.pickFirstString(
            ...candidateEntities.map((entity) => entity?.name),
            ...candidateEntities.map((entity) => entity?.full_name),
            ...candidateEntities.map((entity) => entity?.fullName),
            ...candidateEntities.map((entity) => entity?.display_name),
            ...candidateEntities.map((entity) => entity?.displayName),
            ...candidateEntities.map((entity) => entity?.customer_name),
            ...candidateEntities.map((entity) => entity?.customerName),
            ...candidateEntities.map((entity) => entity?.participant_name),
            ...candidateEntities.map((entity) => entity?.participantName),
            ...candidateEntities.map((entity) => entity?.traveler_name),
            ...candidateEntities.map((entity) => entity?.travelerName),
            ...candidateEntities.map((entity) => entity?.traveller_name),
            ...candidateEntities.map((entity) => entity?.travellerName),
            ...candidateEntities.map((entity) => entity?.booking_contact_name),
            ...candidateEntities.map((entity) => entity?.bookingContactName)
        );

        const email = this.pickFirstString(
            ...candidateEntities.map((entity) => entity?.email),
            ...candidateEntities.map((entity) => entity?.email_address),
            ...candidateEntities.map((entity) => entity?.emailAddress),
            ...candidateEntities.map((entity) => entity?.primary_email),
            ...candidateEntities.map((entity) => entity?.primaryEmail)
        );

        const phone = this.pickFirstString(
            ...candidateEntities.map((entity) => entity?.phone),
            ...candidateEntities.map((entity) => entity?.phone_number),
            ...candidateEntities.map((entity) => entity?.phoneNumber),
            ...candidateEntities.map((entity) => entity?.mobile),
            ...candidateEntities.map((entity) => entity?.mobile_phone),
            ...candidateEntities.map((entity) => entity?.mobilePhone),
            ...candidateEntities.map((entity) => entity?.contact_phone),
            ...candidateEntities.map((entity) => entity?.contactPhone)
        );

        const country = this.pickFirstString(
            ...candidateEntities.map((entity) => entity?.country),
            ...candidateEntities.map((entity) => entity?.country_name),
            ...candidateEntities.map((entity) => entity?.countryName),
            ...candidateEntities.map((entity) => entity?.country_code),
            ...candidateEntities.map((entity) => entity?.countryCode),
            ...candidateEntities.map((entity) => entity?.nationality)
        );

        return {
            firstName,
            lastName,
            fullName,
            email,
            phone,
            country
        };
    }

    private getLeadContactCandidates(lead: any): any[] {
        const candidates = [
            lead,
            lead?.customer,
            lead?.contact,
            lead?.traveler,
            lead?.traveller,
            lead?.participant,
            lead?.passenger,
            lead?.person,
            lead?.profile,
            lead?.guest,
            lead?.customer_details,
            lead?.customerDetails,
            lead?.contact_details,
            lead?.contactDetails,
            lead?.participant_details,
            lead?.participantDetails,
            lead?.primary_customer,
            lead?.primaryCustomer,
            lead?.primary_contact,
            lead?.primaryContact,
            lead?.primary_traveler,
            lead?.primaryTraveler,
            lead?.primary_traveller,
            lead?.primaryTraveller,
            lead?.booking?.customer,
            lead?.booking?.contact,
            lead?.booking?.participant,
            lead?.booking?.traveler,
            lead?.booking?.traveller,
            lead?.participants?.[0],
            lead?.travelers?.[0],
            lead?.travellers?.[0],
            lead?.guests?.[0]
        ];

        return candidates.filter((value) => value && typeof value === 'object');
    }

    private deduplicateBookings(bookings: WeTravelBooking[]): WeTravelBooking[] {
        const bookingMap = new Map<string, WeTravelBooking>();

        for (const booking of bookings) {
            const key = booking.reference || booking.id;

            if (!bookingMap.has(key)) {
                bookingMap.set(key, booking);
            }
        }

        return Array.from(bookingMap.values());
    }

    private async expandBookingsWithParticipants(bookings: WeTravelBooking[]): Promise<WeTravelBooking[]> {
        if (!this.weTravelClient.fetchTripBuyerBookingDetails) {
            return bookings;
        }

        const expandedBookings: WeTravelBooking[] = [];

        for (const booking of bookings) {
            const tripUuid = booking.trip_uuid?.trim();
            const buyerId = String(booking.buyer_id || '').trim();

            if (!tripUuid || !buyerId) {
                expandedBookings.push(booking);
                continue;
            }

            try {
                const details = await this.weTravelClient.fetchTripBuyerBookingDetails(tripUuid, buyerId);
                const resolvedProductName = this.resolveBookingProductName(booking, details) || booking.product_name;
                console.log('Participant expansion for booking:', {
                    bookingRef: booking.reference,
                    originalProductName: booking.product_name,
                    resolvedProductName,
                    tripUuid,
                    buyerId
                });
                const enrichedBooking = {
                    ...booking,
                    product_name: resolvedProductName
                };
                expandedBookings.push(enrichedBooking);

                const participants = this.extractParticipantsFromDetails(details);
                console.log('Extracted participants from booking details:', { participantCount: participants.length });

                for (const participant of participants) {
                    const participantId = this.pickFirstString(
                        typeof participant.id === 'string' || typeof participant.id === 'number'
                            ? String(participant.id)
                            : null,
                        participant.email,
                        participant.full_name
                    );

                    if (!participantId) {
                        continue;
                    }

                    const participantBooking = this.mapParticipantToBooking(enrichedBooking, participant, participantId, details);
                    if (participantBooking) {
                        console.log('Created participant booking:', {
                            participantId,
                            email: participantBooking.buyer.email,
                            phone: participantBooking.buyer.phone
                        });
                        expandedBookings.push(participantBooking);
                    }
                }
            } catch (error) {
                expandedBookings.push(booking);
                console.warn(
                    `Failed to fetch participant details for trip ${tripUuid} buyer ${buyerId}. Continuing without participant expansion.`,
                    error
                );
            }
        }

        return this.deduplicateBookings(expandedBookings);
    }

    private extractParticipantsFromDetails(details: WeTravelTripBuyerBookingDetails | null): WeTravelBookingParticipant[] {
        if (!details) {
            return [];
        }

        const participants: WeTravelBookingParticipant[] = [];

        if (Array.isArray(details.participants)) {
            participants.push(...details.participants);
        }

        if (Array.isArray(details.orders)) {
            for (const order of details.orders) {
                if (Array.isArray(order.participants)) {
                    participants.push(...order.participants);
                }

                if (Array.isArray(order.options)) {
                    for (const option of order.options) {
                        if (Array.isArray(option.participants)) {
                            participants.push(...option.participants);
                        }
                    }
                }
            }
        }

        const deduped = new Map<string, WeTravelBookingParticipant>();

        for (const participant of participants) {
            const key = this.pickFirstString(
                typeof participant.id === 'string' || typeof participant.id === 'number'
                    ? String(participant.id)
                    : null,
                participant.email,
                participant.full_name
            );

            if (!key) {
                continue;
            }

            if (!deduped.has(key)) {
                deduped.set(key, participant);
            }
        }

        return Array.from(deduped.values());
    }

    private mapParticipantToBooking(
        baseBooking: WeTravelBooking,
        participant: WeTravelBookingParticipant,
        participantId: string,
        details: WeTravelTripBuyerBookingDetails | null
    ): WeTravelBooking | null {
        const participantEmail = this.pickFirstString(participant.email, baseBooking.buyer.email);
        const participantFirstName = this.pickFirstString(participant.first_name);
        const participantLastName = this.pickFirstString(participant.last_name);
        const participantPhone = this.extractParticipantPhone(participant);

        if (!participantEmail && !participantFirstName && !participantLastName) {
            return null;
        }

        console.log('Mapping participant to booking:', {
            participantId,
            email: participantEmail,
            firstName: participantFirstName,
            lastName: participantLastName,
            phone: participantPhone
        });

        const participantRef = `${baseBooking.reference || baseBooking.id}:participant:${participantId}`;

        return {
            ...baseBooking,
            id: `${baseBooking.id}:participant:${participantId}`,
            reference: participantRef,
            product_name: this.resolveBookingProductName(baseBooking, details, participant) || baseBooking.product_name,
            amount: participant.total_amount ?? baseBooking.amount,
            total_amount: participant.total_amount ?? baseBooking.total_amount,
            buyer: {
                first_name: participantFirstName || baseBooking.buyer.first_name,
                last_name: participantLastName || baseBooking.buyer.last_name,
                email: participantEmail || baseBooking.buyer.email,
                phone: participantPhone || baseBooking.buyer.phone,
                country: baseBooking.buyer.country
            }
        };
    }

    private extractParticipantPhone(participant: WeTravelBookingParticipant): string | null {
        const directPhone = this.pickFirstString(
            (participant as Record<string, unknown>).phone,
            (participant as Record<string, unknown>).phone_number,
            (participant as Record<string, unknown>).phoneNumber,
            (participant as Record<string, unknown>).mobile,
            (participant as Record<string, unknown>).mobile_phone,
            (participant as Record<string, unknown>).mobilePhone
        );

        if (directPhone) {
            console.log('Found direct phone on participant:', { directPhone });
            return directPhone;
        }

        const surveys = Array.isArray(participant.survey) ? participant.survey : [];
        console.log('Searching participant surveys for phone:', { surveyCount: surveys.length });

        for (const entry of surveys) {
            const isPhoneType = typeof entry?.type === 'string' && entry.type.toLowerCase() === 'phone';
            const isPhoneQuestion =
                typeof entry?.question === 'string' &&
                (entry.question.toLowerCase().includes('phone') || entry.question.toLowerCase().includes('mobile'));

            if (!isPhoneType && !isPhoneQuestion) {
                continue;
            }

            console.log('Found phone survey entry:', { type: entry?.type, question: entry?.question });
            const answers = Array.isArray(entry?.answers) ? entry.answers : [];
            for (const answer of answers) {
                const extractedAnswer = this.extractParticipantAnswerString(answer);
                if (extractedAnswer) {
                    console.log('Extracted phone from survey:', { phone: extractedAnswer });
                    return extractedAnswer;
                }
            }
        }

        console.log('No phone found for participant');
        return null;
    }

    private extractParticipantAnswerString(answer: unknown): string | null {
        if (typeof answer === 'string') {
            const trimmed = answer.trim();
            return trimmed.length > 0 ? trimmed : null;
        }

        if (!answer || typeof answer !== 'object') {
            return null;
        }

        const candidate = answer as Record<string, unknown>;
        return this.pickFirstString(
            candidate.value,
            candidate.answer,
            candidate.text,
            candidate.phone,
            candidate.mobile,
            candidate.number
        );
    }

    private resolveBookingProductName(
        booking: WeTravelBooking,
        details: WeTravelTripBuyerBookingDetails | null,
        participant?: WeTravelBookingParticipant
    ): string | null {
        const currentName = this.pickFirstString(booking.product_name);
        console.log('Resolving product name:', {
            currentName,
            isGeneric: currentName ? this.isGenericBookingProductName(currentName) : 'N/A',
            hasDetails: !!details,
            hasParticipant: !!participant
        });

        const detailedName = this.extractDetailedProductName(details, participant);
        console.log('Extracted detailed product name:', { detailedName });
        if (detailedName) {
            return detailedName;
        }

        if (currentName && !this.isGenericBookingProductName(currentName)) {
            return currentName;
        }

        return currentName;
    }

    private extractDetailedProductName(
        details: WeTravelTripBuyerBookingDetails | null,
        participant?: WeTravelBookingParticipant
    ): string | null {
        if (!details) {
            console.log('No booking details available for product name extraction');
            return null;
        }
        
        console.log('Extracting product name from details:', {
            hasOrders: !!details.orders && details.orders.length > 0,
            orderCount: details.orders?.length,
            hasParticipants: !!details.participants && details.participants.length > 0
        });

        const participantCandidates = participant
            ? [
                participant.product_name,
                participant.productName,
                participant.option_name,
                participant.order_name,
                participant.name,
                participant.title
            ]
            : [];

        const matchedOptionCandidates: Array<unknown> = [];
        const matchedOrderCandidates: Array<unknown> = [];
        const fallbackOptionCandidates: Array<unknown> = [];
        const fallbackOrderCandidates: Array<unknown> = [];

        for (const order of details.orders || []) {
            const orderMatchesParticipant = !!participant && this.matchesIdentifier(participant.order_id, order.id);
            if (orderMatchesParticipant) {
                matchedOrderCandidates.push(order.product_name, order.name, order.title);
            }

            fallbackOrderCandidates.push(order.product_name, order.name, order.title);

            for (const option of order.options || []) {
                const optionMatchesParticipant = !!participant && this.matchesIdentifier(participant.option_id, option.id);
                if (optionMatchesParticipant) {
                    matchedOptionCandidates.push(option.product_name, option.name, option.title);
                }

                fallbackOptionCandidates.push(option.product_name, option.name, option.title);
            }
        }

        return this.pickMeaningfulProductName(
            ...participantCandidates,
            ...matchedOptionCandidates,
            ...matchedOrderCandidates,
            ...fallbackOptionCandidates,
            ...fallbackOrderCandidates
        );
    }

    private pickMeaningfulProductName(...values: Array<unknown>): string | null {
        console.log('Picking meaningful product name from candidates:', { 
            candidateCount: values.length,
            candidates: values.slice(0, 10).map(v => this.pickFirstString(v))
        });
        
        for (const value of values) {
            const candidate = this.pickFirstString(value);
            if (!candidate || this.isGenericBookingProductName(candidate)) {
                continue;
            }

            console.log('Found meaningful product name:', { candidate });
            return candidate;
        }

        console.log('No meaningful product name found among candidates');
        return null;
    }

    private isGenericBookingProductName(value: string): boolean {
        const normalized = value.trim().toLowerCase();
        return normalized.length === 0 || 
               normalized === 'wetravel booking' || 
               normalized === 'unknown product' ||
               normalized === 'placeholder';
    }

    private matchesIdentifier(left: string | number | undefined, right: string | number | undefined): boolean {
        if (left === undefined || right === undefined) {
            return false;
        }

        return String(left).trim() === String(right).trim();
    }

    private async fetchTripBookingsForTrip(tripUuid: string): Promise<WeTravelBooking[]> {
        let bookings: WeTravelBooking[] = [];
        
        if (typeof this.weTravelClient.fetchTripBookings === 'function') {
            bookings = await this.weTravelClient.fetchTripBookings(tripUuid);
        } else if (typeof this.weTravelClient.fetchBookings === 'function') {
            bookings = await this.weTravelClient.fetchBookings(tripUuid);
        } else {
            throw new Error('WeTravel API client does not implement fetchTripBookings');
        }
        
        if (bookings.length > 0) {
            console.log('Fetched bookings from WeTravel:', {
                tripUuid,
                count: bookings.length,
                firstBookingKeys: bookings[0] ? Object.keys(bookings[0]).slice(0, 20) : [],
                firstBookingProductName: bookings[0]?.product_name
            });
        }
        
        return bookings;
    }

    private isNotFoundError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error || '');
        return message.includes('404');
    }

    private pickFirstString(...values: Array<unknown>): string | null {
        for (const value of values) {
            if (typeof value !== 'string') {
                continue;
            }

            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }

        return null;
    }

    private mergeContacts(existing: NormalizedContact, incoming: NormalizedContact): NormalizedContact {
        const existingLastName = existing.Last_Name && existing.Last_Name !== 'Unknown' ? existing.Last_Name : '';
        const incomingLastName = incoming.Last_Name && incoming.Last_Name !== 'Unknown' ? incoming.Last_Name : '';

        const firstName = this.pickMoreInformativeValue(existing.First_Name, incoming.First_Name);
        const lastNameCandidate = this.pickMoreInformativeValue(existingLastName, incomingLastName);

        return {
            First_Name: firstName,
            Last_Name: lastNameCandidate || 'Unknown',
            Email: this.pickMoreInformativeValue(existing.Email, incoming.Email) || null,
            Phone: this.pickMoreInformativeValue(existing.Phone, incoming.Phone) || null,
            Mobile: this.pickMoreInformativeValue(existing.Mobile, incoming.Mobile) || null,
            Country: this.pickMoreInformativeValue(existing.Country, incoming.Country) || null
        };
    }

    private pickMoreInformativeValue(
        current?: string | null,
        candidate?: string | null
    ): string {
        const currentValue = (current || '').trim();
        const candidateValue = (candidate || '').trim();

        if (!currentValue) {
            return candidateValue;
        }

        if (!candidateValue) {
            return currentValue;
        }

        return candidateValue.length > currentValue.length ? candidateValue : currentValue;
    }

    private logImportSummary(summary: {
        mode: 'trip-bookings' | 'legacy';
        leadsFetched: number;
        uniqueContacts: number;
        contactsProcessed: number;
        contactsFailed: number;
        bookedLeadsFetched: number;
        uniqueBookings: number;
        bookingsProcessed: number;
        bookingsFailed: number;
        tripsFetched?: number;
    }): void {
        const modeLabel = summary.mode === 'trip-bookings' ? 'trip-bookings' : 'legacy';
        const tripSegment = summary.tripsFetched !== undefined ? `, trips fetched=${summary.tripsFetched}` : '';

        console.log(
            `[WeTravel Historic Sync] Summary (${modeLabel}): ` +
            `leads fetched=${summary.leadsFetched}, unique contacts=${summary.uniqueContacts}, ` +
            `contacts processed=${summary.contactsProcessed}, contacts failed=${summary.contactsFailed}, ` +
            `booked leads fetched=${summary.bookedLeadsFetched}, unique bookings=${summary.uniqueBookings}, ` +
            `bookings processed=${summary.bookingsProcessed}, bookings failed=${summary.bookingsFailed}` +
            tripSegment
        );
    }

    private getContactKey(input: {
        email?: string | null;
        phone?: string | null;
        fallbackId?: string;
    }): string {
        const email = input.email?.trim().toLowerCase();
        if (email) {
            return email;
        }

        const phone = input.phone?.trim();
        if (phone) {
            return `phone:${phone}`;
        }

        return `lead:${input.fallbackId || 'unknown'}`;
    }

    private async fetchAllLeads(options: {
        trip_uuids?: string[];
        is_booked?: boolean;
        per_page?: 25 | 50 | 100;
    }): Promise<any[]> {
        if (!this.weTravelClient.fetchLeads) {
            return [];
        }

        const perPage = options.per_page || 100;
        const allLeads: any[] = [];
        let page = 1;
        let hasMorePages = false;

        do {
            const { leads, pagination } = await this.weTravelClient.fetchLeads({
                ...options,
                per_page: perPage,
                page
            });

            allLeads.push(...leads);

            const currentPage = Number(pagination?.current_page || pagination?.page || page);
            const totalPages = Number(
                pagination?.total_pages ||
                (pagination?.total_count ? Math.ceil(Number(pagination.total_count) / perPage) : 0)
            );

            if (Number.isFinite(totalPages) && totalPages > 0) {
                hasMorePages = currentPage < totalPages;
            } else {
                hasMorePages = leads.length === perPage;
            }

            page = currentPage + 1;
        } while (hasMorePages);

        return allLeads;
    }

    private normalizeBooking(booking: WeTravelBooking, contactId: string): Omit<ZohoVentrataBooking, 'id'> {
        // Format datetime for Zoho CRM (expects ISO 8601 with timezone, no milliseconds)
        const bookingDate = formatDateTimeForZoho(booking.created_at);
        const rawBookingAmount = this.parseAmount(
            booking.total_amount ?? booking.paid_amount ?? booking.amount
        );
        // WeTravel API returns monetary amounts in cents (e.g. 697000 = 6,970.00).
        const bookingAmount = rawBookingAmount !== undefined ? rawBookingAmount / 100 : undefined;
        const bookingCurrency = (booking.currency_code || booking.currency || '').trim().toUpperCase() || undefined;
        
        console.log('Normalizing booking for Zoho:', {
            reference: booking.reference,
            productName: booking.product_name,
            travelDate: booking.travel_date,
            amount: bookingAmount,
            currency: bookingCurrency
        });
        
        return {
            Booking_Ref: booking.reference || '',
            Name: booking.product_name || '',
            Contact_Id: contactId,
            Product: booking.product_name || '',
            Travel_Date: formatDateTimeForZoho(booking.travel_date),
            Booking_Date: bookingDate,
            ...(bookingAmount !== undefined ? { Booking_Amount: bookingAmount } : {}),
            ...(bookingCurrency ? { Booking_Currency: bookingCurrency } : {})
        };
    }

    private parseAmount(value: unknown): number | undefined {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return undefined;
            }

            const cleaned = trimmed.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
            if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') {
                return undefined;
            }

            const hasComma = cleaned.includes(',');
            const hasDot = cleaned.includes('.');

            let normalized = cleaned;

            if (hasComma && hasDot) {
                const lastComma = cleaned.lastIndexOf(',');
                const lastDot = cleaned.lastIndexOf('.');
                const decimalSeparator = lastComma > lastDot ? ',' : '.';
                const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
                normalized = cleaned
                    .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
                    .replace(decimalSeparator, '.');
            } else if (hasComma) {
                const commaParts = cleaned.split(',');
                const lastPart = commaParts[commaParts.length - 1];
                const looksLikeThousands = commaParts.length > 1 && commaParts.slice(0, -1).every((part) => part.length > 0 && part.length <= 3);

                normalized = looksLikeThousands && lastPart.length === 3
                    ? cleaned.replace(/,/g, '')
                    : cleaned.replace(/,/g, '.');
            } else if (hasDot) {
                const dotParts = cleaned.split('.');
                const lastPart = dotParts[dotParts.length - 1];
                const looksLikeThousands = dotParts.length > 1 && dotParts.slice(0, -1).every((part) => part.length > 0 && part.length <= 3);

                normalized = looksLikeThousands && lastPart.length === 3
                    ? cleaned.replace(/\./g, '')
                    : cleaned;
            }

            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : undefined;
        }

        return undefined;
    }
}
