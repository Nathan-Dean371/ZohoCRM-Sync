# TESTING

Test framework and organization (verified):

- Test runner: Jest with `ts-jest` for TypeScript support (`jest.config.js`, `ts-jest` in `devDependencies`).
- `jest.config.js` configures `roots: ['<rootDir>/src']`, so tests are expected under `src/` or the separate `tests/` folder present in the repo.
- NPM script: `npm test` runs `jest` (see `package.json`).

Evidence:

- [jest.config.js](../../jest.config.js)
- [package.json](../../package.json)
- [tests/](../../tests/)

[TODO] Document mocking patterns and CI test integration (no CI config detected in repo root).

