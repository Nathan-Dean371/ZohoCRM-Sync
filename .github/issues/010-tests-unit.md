## What to build

Unit tests for webhook validation and worker logic (Jest):
- Header validation and enqueue tests.
- Worker job handling tests with mocked Zoho and token manager.
- Idempotency updates and DB interactions mocked.

## Acceptance criteria
- [ ] Unit tests cover validation and core worker behaviors.
- [ ] Tests run under `npm test`.

## Blocked by
- [ ] Implementations for webhook route and worker (issues #3, #6)
