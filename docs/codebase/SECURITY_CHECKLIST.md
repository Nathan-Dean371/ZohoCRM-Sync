# SECURITY CHECKLIST

Use this checklist when handling OAuth credentials, webhook secrets, and other sensitive values.

## Secret storage

- Store refresh tokens, access tokens, and webhook secrets in the database or environment variables only.
- Never render secret values in HTML, logs, API responses, or admin dashboards.
- Restrict database access to least privilege for application and migration roles.
- Encrypt sensitive fields at rest where practical and always require TLS in transit.

## Access control

- Protect all admin routes with JWT authentication and admin role checks.
- Clear invalid or expired auth cookies immediately.
- Return 401 for unauthenticated requests and 403 for unauthorized roles.
- Review route groups periodically to ensure new admin endpoints inherit the same middleware.

## Rotation and lifecycle

- Rotate OAuth client secrets and webhook secrets on a regular schedule.
- Support re-authentication flows that replace stored refresh tokens cleanly.
- Revoke and rotate tokens immediately after suspected leakage.
- Track token expiration metadata and refresh before expiry to avoid outage-driven emergency changes.

## Operational hygiene

- Keep production secrets out of source control and test fixtures.
- Audit logs for accidental token exposure patterns such as refresh_token and access_token.
- Limit who can access admin integration pages and production database credentials.
- Add tests for security-sensitive behavior (auth gates and no token exposure in UI) for every new integration UI route.
