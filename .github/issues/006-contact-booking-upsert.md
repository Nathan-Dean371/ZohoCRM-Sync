## What to build

Implement contact upsert and booking upsert logic used by the worker:
- Upsert Contact by email; fallback to phone; else create.
- Upsert Booking by `Ventrata_Booking_UUID` to ensure idempotency.
- Update `IdempotencyMap` on successful upsert.

## Acceptance criteria
- [ ] Contact upsert works by email/phone fallback.
- [ ] Booking upsert uses `Ventrata_Booking_UUID` and is idempotent.
- [ ] `IdempotencyMap` updated accordingly.

## Blocked by
- [ ] [Worker skeleton](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/6)
- [ ] [DB models](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/2)
- [ ] [Zoho token manager](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/5)
