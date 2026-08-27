import { Request, Response, RequestHandler } from 'express';
import crypto from 'crypto';
import { WebhookEvent } from '../types/ventrata';
import { ventrataBookingCleaner } from '../utils/ventrataBookingCleaner';
import ZohoCRMService from '../services/zoho/zoho-crm-service';
import { ZohoVentrataBooking } from '../types/zoho';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { ventrataWebhookQueue } from '../services/queue';
import { formatDateTimeForZoho } from '../utils/dateFormatter';

function secretsMatch(providedSecret: string, configuredSecret: string) {
    const providedBuffer = Buffer.from(providedSecret);
    const configuredBuffer = Buffer.from(configuredSecret);

    if (providedBuffer.length !== configuredBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, configuredBuffer);
}

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
            Booking_Date: formatDateTimeForZoho(booking.bookingDate),
            Product: booking.productName,
            Travel_Date: formatDateTimeForZoho(booking.travelDate)
        };

        await crmService.createBooking(zohoBooking);

    } catch (error) {
        console.error('Failed to process webhook:', error);
        throw error;
    }
}

/**
 * Processes incoming WeTravel webhook events via Svix.
 * Validates using Svix HMAC-SHA256 signature (SVIX-SIGNATURE and SVIX-TIMESTAMP headers).
 * Persists the event to webhook logs and queues it for processing.
 */
export const processWeTravelWebhook: RequestHandler = async (req, res) => {
    const svixSignature = req.get('svix-signature');
    const svixTimestamp = req.get('svix-timestamp');
    const svixId = req.get('svix-id');
    const configuredWeTravelWebhookSecret = process.env.WE_TRAVEL_WEBHOOK_SECRET?.trim();

    if (!configuredWeTravelWebhookSecret) {
        console.error('WeTravel webhook secret is not configured');
        res.status(500).json({ error: 'Server configuration error' });
        return;
    }

    // Validate Svix signature headers are present
    if (!svixSignature || !svixTimestamp || !svixId) {
        console.warn('Missing Svix signature headers', { svixId, hasSignature: !!svixSignature, hasTimestamp: !!svixTimestamp });
        res.status(401).json({ error: 'Unauthorized: Missing Svix signature headers' });
        return;
    }

    // Svix signs the exact request bytes, not a re-serialized parsed object.
    const bodyJson = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf-8')
        || JSON.stringify(req.body);
    const signedContent = `${svixId}.${svixTimestamp}.${bodyJson}`;

    // Svix secrets are prefixed with "whsec_".
    // If formatted with whsec_ prefix, extract the base64 portion and decode it.
    const secretBytes = configuredWeTravelWebhookSecret.startsWith('whsec_')
        ? Buffer.from(configuredWeTravelWebhookSecret.substring(6), 'base64')
        : Buffer.from(configuredWeTravelWebhookSecret, 'utf-8');

    const expectedSignature = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

    // Extract the actual signature from "v1,v2,..." format
    const signatures = svixSignature.split(' ').map(sig => sig.split(',')[1]).filter(Boolean);

    const isValid = signatures.some(sig => secretsMatch(sig || '', expectedSignature));

    if (!isValid) {
        console.warn('Invalid Svix signature validation failed', { 
            svixId,
            providedSignatures: signatures.length
        });
        res.status(401).json({ error: 'Unauthorized: Invalid Svix signature' });
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
        void ventrataWebhookQueue.add('process-wetravel-webhook', {
            payload: req.body,
            logId: log.id
        }).catch((error) => {
            console.error('Error enqueueing WeTravel webhook job:', error);
        });
    } catch (error) {
        console.error('Error processing WeTravel webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
}
