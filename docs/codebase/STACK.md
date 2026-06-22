# STACK

Core stack (verified from repository files):

- Language: TypeScript (`.ts` source files, `tsconfig.json`).
- Runtime: Node.js (managed via `npm` scripts in `package.json`).
- Web framework: Express (`express` in `dependencies` in `package.json`).
- ORM / Database: Prisma ORM targeting PostgreSQL (`prisma/schema.prisma`, `@prisma/client` in `package.json`).
- Testing: Jest with `ts-jest` (`jest.config.js`, `ts-jest` in `devDependencies`).
- Dev tooling: `nodemon`, `ts-node`, `eslint`, `prettier` (listed in `package.json`).

Notes / unknowns:

- [TODO] Exact Node.js runtime version not specified in repository.

Evidence (selected):

- [package.json](../../package.json)
- [tsconfig.json](../../tsconfig.json)
- [jest.config.js](../../jest.config.js)
- [prisma/schema.prisma](../../prisma/schema.prisma)

