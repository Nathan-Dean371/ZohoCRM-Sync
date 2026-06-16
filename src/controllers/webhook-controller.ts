import { Request, Response, RequestHandler } from 'express';
import { WebhookEvent } from '../types/ventrata';
import { ventrataBookingCleaner } from '../utils/ventrataBookingCleaner';
import ZohoCRMService from '../services/zoho/zoho-crm-service';
import { ZohoVentrataBooking } from '../types/zoho';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { ventrataWebhookQueue } from '../services/queue';

export const processVentrataWebhook: RequestHandler = async (req, res) => {
    const xWebhookSecret = req.get('X-Webhook-Secret');
    const ventrataWebhookSecret = await integrationDataService.getVentrataWebhookSecret();

    if (!ventrataWebhookSecret || xWebhookSecret !== ventrataWebhookSecret) {
        res.status(401).send('Unauthorized: Invalid or missing X-Webhook-Secret');
        return;
    }

    // Persist to Webhook_Logs
    const log = await integrationDataService.createWebhookLog({
        payload: req.body,
        status: 'RECEIVED'
    });

    // Respond immediately to Ventrata
    res.status(200).send('Webhook received and acknowledged');

    // Enqueue the job for background processing
    await ventrataWebhookQueue.add('process-ventrata-webhook', {
        payload: req.body,
        logId: log.id
    });
};

export async function handleBookingWebhook(webhookEvent: WebhookEvent) {
    const crmService = new ZohoCRMService();
    if (webhookEvent.booking?.status !== 'CONFIRMED') {
        return;
    }

    const { contact, booking } = ventrataBookingCleaner(webhookEvent.booking);

    try {
        // Find existing contact
        const existingContact = await crmService.findContactByEmail(contact.email);

        let contactId;
        if (existingContact) {
            contactId = existingContact.id;
        } else {
            const newContact = await crmService.createContact(contact);
            contactId = newContact.id;
        }

        const zohoBooking: Omit<ZohoVentrataBooking, 'id'> = {
            Booking_Ref: booking.supplierReference,
            Name: `Booking ${booking.supplierReference}`,
            Contact_Id: contactId,  // Changed from Contact object to just the ID
            Booking_Date: booking.bookingDate,
            Product: booking.productName,
            Travel_Date: booking.travelDate
        };

        await crmService.createBooking(zohoBooking);

    } catch (error) {
        console.error('Failed to process webhook:', error);
        throw error;
    }
}

/**
 * Processes incoming WeTravel webhook events.
 * Expects X-Webhook-Secret header for HMAC validation.
 * Persists the event to webhook logs and queues it for processing.
 */
export const processWeTravelWebhook: RequestHandler = async (req, res) => {
    const xWebhookSecret = req.get('X-Webhook-Secret');

    if (!xWebhookSecret) {
        res.status(401).json({ error: 'Unauthorized: Missing X-Webhook-Secret header' });
        return;
    }

    try {
        // Persist to Webhook_Logs
        const log = await integrationDataService.createWebhookLog({
            payload: req.body,
            status: 'RECEIVED'
        });

        // Respond immediately to WeTravel (Svix best practice)
        res.status(200).json({ received: true, logId: log.id });

        // Enqueue the job for background processing
        // Note: Using ventrata queue for now; may create wetravel-specific queue in future
        await ventrataWebhookQueue.add('process-wetravel-webhook', {
            payload: req.body,
            logId: log.id
        });
    } catch (error) {
        console.error('Error processing WeTravel webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
}
