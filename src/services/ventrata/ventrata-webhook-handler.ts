import { WebhookEvent, VentrataBooking, CleanContact, CleanBooking } from '../../types/ventrata';
import { ZohoContact, ZohoVentrataBooking } from '../../types/zoho';
import ZohoCRMService from '../zoho/zoho-crm-service';
import { idempotencyService, IdempotencyService } from '../database/idempotency-service';
import { formatDateTimeForZoho } from '../../utils/dateFormatter';

class VentrataWebhookHandler {
    private readonly zohoService: ZohoCRMService;

    constructor(
        private readonly idService: IdempotencyService = idempotencyService,
        zohoService?: ZohoCRMService
    ) {
        this.zohoService = zohoService || new ZohoCRMService();
    }

    /**
     * Main handler for incoming Ventrata webhooks
     * Only processes booking_update events with valid booking payload
     */
    async handleWebhook(event: WebhookEvent): Promise<void> {
        try {
            console.log('Received webhook event:', {
                type: event.webhook?.event,
                bookingStatus: event.booking?.status,
                uuid: event.booking?.uuid
            });

            if (event.webhook?.event !== 'booking_update' || !event.booking?.status) {
                console.log('Skipping webhook - not a booking update');
                return;
            }

            await this.processBooking(event.booking);
        } catch (error) {
            console.error('Error processing webhook:', error);
            throw error;
        }
    }

    /**
     * Processes a booking by creating/updating contact and booking records in Zoho,
     * mapping Ventrata status, pricing minor units, currency, and marketing consent.
     */
    async processBooking(booking: VentrataBooking): Promise<{ zohoBookingId: string; missingContact: boolean }> {
        console.log('Processing booking:', booking.uuid, booking.status);

        // Stale payload rejection check
        if (booking.utcUpdatedAt && await this.idService.isStale(booking.uuid, 'ventrata', booking.utcUpdatedAt)) {
            console.log(`Booking ${booking.uuid} update ${booking.utcUpdatedAt} is older than or equal to stored timestamp. Skipping update.`);
            const existingId = await this.idService.getZohoId(booking.uuid, 'ventrata');
            return { zohoBookingId: existingId || '', missingContact: false };
        }

        const email = booking.contact?.emailAddress || null;
        const phone = booking.contact?.phoneNumber || null;
        const hasIdentity = Boolean(email || phone);
        let zohoContactId: string | undefined = undefined;

        if (hasIdentity) {
            const contactData = this.extractContactData(booking);
            const zohoContact = await this.zohoService.upsertContact({
                First_Name: contactData.First_Name,
                Last_Name: contactData.Last_Name,
                Email: contactData.email,
                Phone: contactData.phoneNumber,
                Country: contactData.country,
                Marketing_Consent: typeof booking.contact?.allowMarketing === 'boolean' ? booking.contact.allowMarketing : undefined
            });

            zohoContactId = zohoContact.id;
            console.log('Contact processed in Zoho:', {
                id: zohoContact.id,
                email: zohoContact.Email
            });
        } else {
            console.log(`Booking ${booking.uuid} has no email or phone. Syncing booking without Contact_Id.`);
        }

        // Net amount minor units conversion and currency mapping
        const precision = typeof booking.currencyPrecision === 'number' ? booking.currencyPrecision : 2;
        const bookingAmount = typeof booking.netAmount === 'number' ? booking.netAmount / Math.pow(10, precision) : undefined;
        const currency = booking.currency || undefined;

        const bookingData = this.extractBookingData(booking);
        const bookingStatus = this.mapBookingStatus(booking.status);
        const bookingName = (booking.utcConfirmedAt || new Date().toISOString()) + " - " + bookingData.productName;

        const zohoBooking = await this.zohoService.upsertBooking({
            Name: bookingName,
            Booking_Ref: booking.uuid,
            Contact_Id: zohoContactId,
            Booking_Date: formatDateTimeForZoho(booking.utcConfirmedAt || new Date().toISOString()),
            Product: bookingData.productName,
            Travel_Date: formatDateTimeForZoho(bookingData.travelDate),
            Booking_Status: bookingStatus,
            Status: bookingStatus,
            Booking_Amount: bookingAmount,
            Booking_Currency: currency,
            Currency: currency,
            Booking_Source: "Ventrata"
        });

        console.log('Booking processed in Zoho:', {
            id: zohoBooking.id,
            ref: zohoBooking.Booking_Ref
        });

        if (zohoBooking.id) {
            await this.idService.saveMapping(booking.uuid, zohoBooking.id, 'ventrata', booking.utcUpdatedAt);
            console.log(`Idempotency map updated for booking ${booking.uuid} -> ${zohoBooking.id}`);
        }

        return {
            zohoBookingId: zohoBooking.id || '',
            missingContact: !hasIdentity
        };
    }

    /**
     * Maps a Ventrata booking status onto the Zoho Booking_Status/Status vocabulary
     */
    private mapBookingStatus(status: VentrataBooking['status']): string {
        switch (status) {
            case 'CANCELLED':
                return 'Cancelled';
            case 'REDEEMED':
                return 'Redeemed';
            case 'CONFIRMED':
                return 'Confirmed';
            default:
                return String(status);
        }
    }

    /**
     * Extracts and formats contact information from a Ventrata booking
     */
    private extractContactData(booking: VentrataBooking): CleanContact {
        const contact = booking.contact || {};

        return {
            fullName: contact.fullName || '',
            First_Name: contact.firstName || '',
            Last_Name: contact.lastName || (contact.fullName ? contact.fullName.split(' ').pop() : '') || 'Unknown',
            email: contact.emailAddress || null,
            phoneNumber: contact.phoneNumber || null,
            country: contact.country || null,
            supplierReference: booking.supplierReference || ''
        };
    }

    /**
     * Extracts and formats booking information from a Ventrata booking
     */
    private extractBookingData(booking: VentrataBooking): CleanBooking {
        const availabilityStart = booking.availability?.localDateTimeStart || booking.utcConfirmedAt || new Date().toISOString();
        const productName = booking.product?.internalName || booking.productName || 'Ventrata Booking';

        return {
            productName,
            travelDate: availabilityStart,
            bookingDate: booking.utcConfirmedAt || new Date().toISOString(),
            supplierReference: booking.supplierReference || ''
        };
    }
}

export default VentrataWebhookHandler;