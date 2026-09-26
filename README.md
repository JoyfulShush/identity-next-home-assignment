# identity-next-home-assignment

Backend service built with Fastify and TypeScript, for evaluation purposes.

## Requirements

- Node.js 24 (see `.nvmrc`)

## Setup

```bash
npm install
```

## Running

```bash
npm run build   # compile TypeScript to dist/
npm start       # run the compiled server
```

or, for local development with auto-reload:

```bash
npm run dev
```

The server listens on port `4000`. Health check: `GET /health`.

## Testing

```bash
npm test
```

Tests are written with Jest and `ts-jest`, using Fastify's `inject` for in-process HTTP testing.
Test files live under `test/` (outside `src/`), mirroring the source they cover.

## Formatting

```bash
npm run format        # write formatting fixes
npm run format:check  # verify formatting, no changes
```

Formatting is enforced with Prettier.

## Design

- **Fastify** (`src/app.ts`) builds the app instance; `src/index.ts` is the entrypoint that starts
  it listening on port 4000. Splitting build/start allows the app instance to be tested via
  `inject()` without binding to a network port.
- **JSON Schema** validation will be added per-route as endpoints are introduced.
- **TypeScript** is compiled with `tsc` (strict mode, ECMAScript modules via `NodeNext`) to `dist/`.
  The project uses native `import`/`export` syntax throughout (`"type": "module"` in
  `package.json`); relative imports require an explicit `.js` extension, as Node's ESM resolver
  expects.
- **Two tsconfig files**: `tsconfig.json` is the base, used by the editor and by `ts-jest`, and
  includes both `src/` and `test/`. `tsconfig.build.json` extends it and restricts compilation to
  `src/` only, so `npm run build` never emits test files into `dist/`.
