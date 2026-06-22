# CONVENTIONS

Repository and coding conventions (verified):

- TypeScript is used with `strict` enabled (`tsconfig.json`).
- Linting and formatting: `eslint` and `prettier` are present and lint scripts exist in `package.json`.
- Source organization: route definitions live under `src/routes/`, controllers under `src/controllers/`, and business logic/integrations under `src/services/`.
- Build output: TypeScript compiles from `src/` to `dist/` per `tsconfig.json` `rootDir`/`outDir` settings.

Evidence:

- [tsconfig.json](../../tsconfig.json)
- [package.json](../../package.json)

[TODO] Add styleguide, commit message conventions, and branching strategy (not present in repository).

