# PRD: Add WeTravel sync integration

## Problem Statement

Operators currently have a production pipeline for Ventrata -> Zoho, but no first-class path to sync WeTravel contacts and bookings into the same Zoho data model. Without a WeTravel integration, teams must do manual exports/imports, causing delayed updates, duplicate records, and inconsistent booking context in CRM.

## Solution

Add a WeTravel sync integration that reuses the existing asynchronous ingestion architecture (ingress validation, queue processing, retry/DLQ, webhook logs, idempotency, and Zoho token lifecycle), while introducing WeTravel-specific auth handling and payload normalization.

From the user perspective, the product should provide:
- A clear admin setup flow for WeTravel credentials and webhook endpoint registration.
- Reliable near-real-time synchronization of WeTravel booking/contact changes to Zoho.
- Safe retries, idempotent writes, and replayable logs when failures occur.

## User Stories

1. As an admin, I want to connect WeTravel from the integration settings area, so that WeTravel events can be synced into Zoho.
2. As an admin, I want setup guidance that explicitly says WeTravel Pro is required, so that I do not attempt unsupported setup on lower plans.
3. As an admin, I want to store the WeTravel API Access Token (refresh-style seed token) once during onboarding, so that the system can obtain short-lived bearer tokens automatically.
4. As an admin, I want the system to indicate that the WeTravel token is shown only once by WeTravel, so that I securely capture it at creation time.
5. As an admin, I want credential input restricted to privileged integration admins, so that non-authorized users cannot alter production sync.
6. As an admin, I want the app to display the webhook endpoint URL I must paste into WeTravel/Svix, so that I can complete webhook registration quickly.
7. As an admin, I want to test WeTravel connectivity before going live, so that I can confirm credentials are valid.
8. As an operator, I want webhook logs filtered by source (Ventrata vs WeTravel), so that I can troubleshoot integration-specific issues.
9. As an operator, I want to replay historical WeTravel events, so that I can recover from transient sync failures.

## Tags
- integration
- ready-for-agent
