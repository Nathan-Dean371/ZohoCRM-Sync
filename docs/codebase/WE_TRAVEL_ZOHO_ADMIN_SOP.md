# WeTravel Zoho Admin SOP

## Purpose

This SOP explains how to prepare Zoho CRM for the WeTravel sync flow used by this project.

The current application contract expects:

- Standard Zoho Contacts for traveler/contact records.
- A Zoho custom booking module that matches the existing `/Bookings` CRM contract used by the app.
- Exact field API names that align with the integration payloads.

If you rename the module API name or the field API names, the integration will stop matching records correctly and the code will need to be updated.

## Scope

This SOP covers only the Zoho CRM setup required for WeTravel Contacts and Bookings.

It does not cover:

- WeTravel webhook registration.
- WeTravel token capture or refresh handling.
- App-side implementation details.

## Prerequisites

Before you start, confirm the following:

- You have Zoho CRM admin access.
- You know which Zoho organization will receive the sync.
- You have a WeTravel account on a plan that supports the integration setup required by the app.
- You are using the main WeTravel account that is allowed to create integration credentials.
- You do not need to supply an organization ID for the v2 admin setup flow.
- You are prepared to create or verify a custom booking module in Zoho.

## Entity 1: Contacts

Use Zoho's standard Contacts module for all traveler/contact records.

### Required fields

- `Last_Name` - required.

### Recommended fields

- `First_Name`
- `Email`
- `Phone`
- `Country`

### How the integration uses Contacts

- The app looks up contacts by `Email` first.
- If no contact is found by email and a phone number exists, it falls back to `Phone`.
- If no matching contact exists, the app creates a new contact.

### Admin steps

1. Open Zoho CRM.
2. Go to the Contacts module.
3. Confirm that `Last Name` is enabled as a required field.
4. Confirm that `First Name`, `Email`, `Phone`, and `Country` are available.
5. If any of those fields are missing, add them before proceeding.
6. Create one test contact and confirm it can be searched by email and phone.

### Notes

- Keep the Zoho API field names unchanged.
- Display labels may be more user-friendly, but the API names must remain the ones above.

## Entity 2: Bookings

Create a custom module for bookings that matches the application's current CRM contract.

The app currently uses the Zoho `/Bookings` API path, so the module API name must remain `Bookings` unless the code is updated.

### Required fields

- `Booking_Ref` - stable external booking identifier used for idempotent upsert.
- `Name` - booking display name.
- `Contact_Id` - link back to the related Contact record.
- `Booking_Date`
- `Product`
- `Travel_Date`

### How the integration uses Bookings

- The app looks up bookings by `Booking_Ref`.
- If a booking already exists, the app updates it instead of creating a duplicate.
- The booking must link back to the correct contact through `Contact_Id`.

### Admin steps

1. Open Zoho CRM.
2. Go to the module builder or custom module setup area.
3. Create a custom module for bookings, or verify that the existing module API name is `Bookings`.
4. Add the required fields with the exact API names listed above.
5. Set `Booking_Ref` to behave as the stable unique identifier for upsert operations.
6. Create a lookup or equivalent relationship field for `Contact_Id` so each booking can point to one contact.
7. Confirm the module allows creating and updating records with those field names.
8. Create one test booking and make sure it can reference a contact record.

### Notes

- Use clear display labels for admins, but do not change the API names.
- If your Zoho org already has a different booking module API name, stop and coordinate with engineering before changing it.

## Validation Checklist

Before enabling the sync, verify the following in Zoho:

1. A contact can be created with `Last_Name` and searched by `Email`.
2. A contact can be found by `Phone` when email is not available.
3. A booking can be created with a valid `Contact_Id` link.
4. A booking can be matched by `Booking_Ref` and updated without duplication.
5. The booking module API name is `Bookings`.
6. The contact module is the standard Zoho Contacts module.

## Do Not Change

Do not change these without a code update:

- Contact field API names used by the integration.
- Booking field API names used by the integration.
- The booking module API name expected by the app.
- The `Booking_Ref` behavior as the stable upsert key.

## Quick Field Reference

### Contacts

| API Name | Required | Purpose |
| --- | --- | --- |
| `Last_Name` | Yes | Primary required contact field |
| `First_Name` | No | Contact given name |
| `Email` | No | Primary matching key |
| `Phone` | No | Fallback matching key |
| `Country` | No | Optional location field |

### Bookings

| API Name | Required | Purpose |
| --- | --- | --- |
| `Booking_Ref` | Yes | Stable external identifier for idempotency |
| `Name` | Yes | Booking display name |
| `Contact_Id` | Yes | Link to the related contact |
| `Booking_Date` | Yes | Booking date |
| `Product` | Yes | Product or package name |
| `Travel_Date` | Yes | Travel date |

## Hand-Off Notes

If this SOP is being handed to another person or model for polishing, keep the following facts intact:

- Contacts use the standard Zoho Contacts module.
- Bookings use the existing `/Bookings` contract.
- `Booking_Ref` is the idempotency key.
- `Contact_Id` links the booking to the contact.
- API names matter more than display labels.
