import ZohoCRMService from '../zoho/zoho-crm-service';
import { idempotencyService, IdempotencyService } from '../database/idempotency-service';
import { formatDateTimeForZoho } from '../../utils/dateFormatter';

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
      const eventType = event?.type || event?.webhook?.event || 'unknown';
      console.log('WeTravel event received:', eventType);

      // Route to specific handler based on event type
      if (eventType.startsWith('lead.')) {
        await this.handleLeadEvent(event);
      } else {
        // Default to booking handler
        await this.handleBookingEvent(event);
      }
    } catch (error: any) {
      console.error('Error processing WeTravel webhook:', error);
      throw error;
    }
  }

  private async handleLeadEvent(event: any): Promise<void> {
    console.log('🔄 handleLeadEvent() called', { eventType: event?.type });

    // Normalize shape if adapter provides different structure
    // Svix wraps payload in event.data, but may also have nested lead object
    const lead = event.lead || event.data?.lead || event.data;
    if (!lead) {
      console.log('❌ No lead found on WeTravel event; skipping');
      return;
    }

    const leadId = lead.uuid || lead.id;
    if (!leadId) {
      console.log('❌ No lead ID found on WeTravel event; skipping');
      return;
    }

    // Ensure leadId is a string for idempotency lookup
    const leadIdStr = String(leadId);

    console.log(`📋 Processing lead ${leadIdStr}`, { 
      email: lead.email, 
      name: lead.name,
      leadType: lead.lead_type 
    });

    // Check idempotency
    const existingZohoId = await this.idService.getZohoId(leadIdStr, 'wetravel');
    if (existingZohoId) {
      console.log(`⏭️  Lead ${leadIdStr} already processed (Zoho ID: ${existingZohoId}). Skipping duplicate.`);
      return;
    }

    // Extract and create contact in Zoho
    const contactData = this.extractContactDataFromLead(lead);
    console.log(`📝 Extracted contact data:`, contactData);

    console.log(`🚀 Upserting contact to Zoho...`);
    const zohoContact = await this.zohoService.upsertContact({
      First_Name: contactData.First_Name,
      Last_Name: contactData.Last_Name,
      Email: contactData.email,
      Phone: contactData.phoneNumber,
      Mobile: contactData.phoneNumber,
      Country: contactData.country
    });

    console.log(`✅ Zoho upsert response:`, { 
      zohoId: zohoContact?.id,
      zohoRecordType: typeof zohoContact 
    });

    if (zohoContact?.id) {
      await this.idService.saveMapping(leadIdStr, zohoContact.id, 'wetravel');
      console.log(`✅ WeTravel idempotency map updated: lead ${leadIdStr} → Zoho ${zohoContact.id}`);
    } else {
      console.warn(`⚠️  Zoho contact upsert did not return an ID`, { zohoContact });
    }
  }

  private async handleBookingEvent(event: any): Promise<void> {
    // Normalize shape if adapter provides different structure; assume event.booking present
    const booking = event.booking || event.data?.booking;
    if (!booking) {
      console.log('No booking found on WeTravel event; skipping');
      return;
    }

    const bookingId = booking.uuid || booking.id || booking.supplierReference;
    if (!bookingId) {
      console.log('No booking ID found on WeTravel event; skipping');
      return;
    }

    // Ensure bookingId is a string for idempotency lookup
    const bookingIdStr = String(bookingId);

    const existingZohoId = await this.idService.getZohoId(bookingIdStr, 'wetravel');
    if (existingZohoId) {
      console.log(`Booking ${bookingIdStr} already processed (Zoho ID: ${existingZohoId}). Skipping duplicate replay.`);
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
      Mobile: contact.phoneNumber,
      Country: contact.country
    });

    // After contact is available, upsert booking record (idempotent by Booking_Ref)
    const bookingData = this.extractBookingData(booking);

    const bookingName = (booking.utcConfirmedAt || booking.confirmedAt || new Date().toISOString()) + ' - ' + bookingData.productName;

    const zohoBooking = await this.zohoService.upsertBooking({
      Name: bookingName,
      Booking_Ref: bookingId,
      Contact_Id: zohoContact.id,
      Booking_Date: formatDateTimeForZoho(booking.utcConfirmedAt || booking.confirmedAt),
      Product: bookingData.productName,
      Travel_Date: formatDateTimeForZoho(bookingData.travelDate),
      ...(bookingData.amount !== undefined ? { Booking_Amount: bookingData.amount } : {}),
      ...(bookingData.currency ? { Booking_Currency: bookingData.currency } : {})
    });

    if (zohoBooking?.id) {
      await this.idService.saveMapping(bookingIdStr, zohoBooking.id, 'wetravel');
      console.log(`WeTravel idempotency map updated for booking ${bookingIdStr}`);
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

  private extractContactDataFromLead(lead: any) {
    // Handle both "name" (single field) and "firstName"/"lastName" (separate fields)
    const fullName = lead.fullName 
      || lead.name 
      || `${lead.firstName || ''} ${lead.lastName || ''}`.trim();

    const firstName = (lead.firstName || fullName.split(' ')[0] || '').trim();
    const lastName = (lead.lastName || fullName.split(' ').slice(1).join(' ') || '').trim();

    return {
      fullName,
      First_Name: firstName || '',
      Last_Name: lastName || 'Unknown',
      email: lead.email || lead.emailAddress,
      phoneNumber: lead.phone || lead.phoneNumber,
      country: lead.country || lead.countryCode
    };
  }

  private extractBookingData(booking: any) {
    const trip = booking.trip || booking.reservation?.trip || booking.order?.trip || {};
    const order = booking.order || booking.reservation?.order || {};
    const options = Array.isArray(order.options) ? order.options : [];
    const firstOption = options[0] || {};
    const amount = this.parseAmount(
      booking.totalAmount
      ?? booking.total_amount
      ?? booking.amount
      ?? booking.pricing?.total
      ?? booking.pricing?.amount
      ?? booking.payment?.total
      ?? booking.payment?.amount
    );

    const currency = this.parseCurrency(
      booking.currency
      ?? booking.currencyCode
      ?? booking.currency_code
      ?? booking.pricing?.currency
      ?? booking.payment?.currency
    );

    const productName =
      booking.productName
      || booking.product_name
      || booking.title
      || booking.name
      || booking.product?.name
      || booking.product?.title
      || trip.title
      || trip.name
      || trip.product_name
      || order.product_name
      || order.trip_name
      || order.name
      || firstOption.product_name
      || firstOption.title
      || firstOption.name
      || 'Unknown Product';

    return {
      productName,
      travelDate: booking.travelDate || booking.startDate || booking.availability?.localDateTimeStart,
      bookingDate: booking.utcConfirmedAt || booking.confirmedAt || booking.createdAt,
      supplierReference: booking.supplierReference || booking.id || booking.uuid,
      amount,
      currency
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

  private parseCurrency(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim().toUpperCase();
    return trimmed || undefined;
  }
}

export default WeTravelWebhookHandler;
