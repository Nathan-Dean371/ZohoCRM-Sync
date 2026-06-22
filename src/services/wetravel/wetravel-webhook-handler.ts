import ZohoCRMService from '../zoho/zoho-crm-service';
import { idempotencyService, IdempotencyService } from '../database/idempotency-service';

/**
 * Handler for incoming WeTravel webhooks.
 * Ensures contact sync happens before booking upsert and updates idempotency map.
 */
class WeTravelWebhookHandler {
  private readonly zohoService: ZohoCRMService;

  constructor(
    private readonly idService: IdempotencyService = idempotencyService,
    zohoService?: ZohoCRMService
  ) {
    this.zohoService = zohoService || new ZohoCRMService();
  }

  async handleWebhook(event: any): Promise<void> {
    try {
      console.log('WeTravel event received:', event?.type || event?.webhook?.event || 'unknown');

      // Normalize shape if adapter provides different structure; assume event.booking present
      const booking = event.booking || event.data?.booking;
      if (!booking) {
        console.log('No booking found on WeTravel event; skipping');
        return;
      }

      // Only handle bookings that are relevant (e.g., created/updated/cancelled)
      const lifecycle = booking.status || event.type || 'unknown';

      // If booking was cancelled and we don't support cancellations in Zoho, skip
      // Otherwise proceed to ensure contact exists first

      const contact = this.extractContactData(booking);

      // Upsert contact in Zoho
      const zohoContact = await this.zohoService.upsertContact({
        First_Name: contact.First_Name,
        Last_Name: contact.Last_Name,
        Email: contact.email,
        Phone: contact.phoneNumber,
        Country: contact.country
      });

      // After contact is available, upsert booking record (idempotent by Booking_Ref)
      const bookingData = this.extractBookingData(booking);

      const bookingName = (booking.utcConfirmedAt || booking.confirmedAt || new Date().toISOString()) + ' - ' + bookingData.productName;

      const zohoBooking = await this.zohoService.upsertBooking({
        Name: bookingName,
        Booking_Ref: booking.uuid || booking.id || bookingData.supplierReference,
        Contact_Id: zohoContact.id,
        Booking_Date: booking.utcConfirmedAt || booking.confirmedAt,
        Product: bookingData.productName,
        Travel_Date: bookingData.travelDate
      });

      if (zohoBooking?.id) {
        await this.idService.saveMapping(booking.uuid || booking.id, zohoBooking.id);
        console.log(`WeTravel idempotency map updated for booking ${booking.uuid || booking.id}`);
      }

    } catch (error: any) {
      console.error('Error processing WeTravel webhook:', error);
      throw error;
    }
  }

  private extractContactData(booking: any) {
    const contact = booking.contact || booking.traveller || {};
    const fullName = contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();

    return {
      fullName,
      First_Name: contact.firstName || (fullName.split(' ')[0] || ''),
      Last_Name: contact.lastName || (fullName.split(' ').slice(1).join(' ') || 'Unknown'),
      email: contact.email || contact.emailAddress,
      phoneNumber: contact.phone || contact.phoneNumber,
      country: contact.country || contact.countryCode,
      supplierReference: booking.supplierReference || booking.id || booking.uuid
    };
  }

  private extractBookingData(booking: any) {
    return {
      productName: booking.productName || booking.product?.name || 'Unknown Product',
      travelDate: booking.travelDate || booking.startDate || booking.availability?.localDateTimeStart,
      bookingDate: booking.utcConfirmedAt || booking.confirmedAt || booking.createdAt,
      supplierReference: booking.supplierReference || booking.id || booking.uuid
    };
  }
}

export default WeTravelWebhookHandler;
