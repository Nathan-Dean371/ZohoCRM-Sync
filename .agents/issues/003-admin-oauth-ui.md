## What to build

A minimal admin onboarding UI that:
- Implements OAuth redirect flow to obtain Zoho `refresh_token`.
- Stores `refresh_token` (and token metadata) into `IntegrationConfig`.
- Protects admin UI behind JWT-auth middleware.

## Acceptance criteria
- [ ] OAuth flow implemented and stores refresh token.
- [ ] Admin UI page to initiate OAuth and show connection status.
- [ ] Access controlled by existing admin auth middleware.

## Blocked by
- [ ] [DB models](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/2)
