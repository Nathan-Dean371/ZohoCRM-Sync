## What to build

Protect admin UI and secure token storage:
- JWT-protected admin routes.
- Ensure tokens are stored in DB and not exposed via UI.
- Provide a short security checklist for storing secrets and rotation.

## Acceptance criteria
- [ ] Admin routes require JWT with admin role.
- [ ] Tokens not displayed in UI; only connection status.
- [ ] Security checklist added to repo docs.

## Blocked by
- [ ] [Admin OAuth UI](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/4)
