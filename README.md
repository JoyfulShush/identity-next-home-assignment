# identity-next-home-assignment

Backend service built with Fastify and TypeScript, for evaluation purposes. Uses MongoDB for
storage and Redis with Redlock for distributed locking, both backed by in-memory mocks so the
app and its tests are fully self-contained.

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

```bash
npm run coverage
```

Runs the test suite with coverage collected from `src/` (excluding `src/index.ts` and
`src/types/`). Enforces a minimum of 85% for statements, branches, functions, and lines.

## Formatting

```bash
npm run format        # write formatting fixes
npm run format:check  # verify formatting, no changes
```

Formatting is enforced with Prettier.

## Error Handling

All routes share a single, central error handler (`src/Fastify/errors/`), so individual endpoints
don't need their own try/catch boilerplate. It covers three cases:

- **Bad input**: if a request fails schema validation, the caller gets a `400 Bad User Input`
  response that names the offending field, explains why it failed, and echoes back the value that
  was sent, so the caller can compare what was expected against what they actually sent.
- **Known, intentional failures**: business logic can throw a small set of named errors (e.g. "not
  found", "conflict", "unauthorized") to signal an expected failure condition. These are returned
  to the caller as-is, with the matching status code and a plain `message` explaining what went
  wrong.
- **Anything unexpected**: any other error, whether it happens synchronously or inside an `async`
  handler, is caught automatically. The caller only ever sees a generic `500 Internal Server Error`
  — the real error and its details are logged internally, never exposed in the response, so
  internal failure reasons can't leak to API consumers.

## Distributed Locking

The login, update, and logout operations all read a session and then write to it, which opens a
window for a race: if two requests for the _same_ session arrive close together, both could read
the "before" state and step on each other's write.

To prevent this, each operation is wrapped in a Redis-backed lock keyed by the combination of
`tenantId`, `username`, and `ip`. A request for one session never blocks a request for a different
session — only requests that share all three fields queue up behind one another, waiting for the
lock to free up before they start processing.

For this evaluation project, Redis itself is an in-memory mock, following the same self-contained
approach used for MongoDB: no external Redis server is needed to run the app or its tests.

## Design

- **Fastify** (`src/app.ts`) builds the app instance; `src/index.ts` is the entrypoint that starts
  it listening on port 4000. Splitting build/start allows the app instance to be tested via
  `inject()` without binding to a network port.
- **Request flow**: each endpoint is split across `src/Fastify/Routers` (route definition, schema
  validation, middleware), `src/Fastify/Controllers` (picks the service to call and the response
  status/shape), and `src/Fastify/Services` (business logic). JSON Schema validation lives on the
  router.
- **TypeScript** is compiled with `tsc` (strict mode, ECMAScript modules via `NodeNext`) to `dist/`.
  The project uses native `import`/`export` syntax throughout (`"type": "module"` in
  `package.json`); relative imports require an explicit `.js` extension, as Node's ESM resolver
  expects.
- **Two tsconfig files**: `tsconfig.json` is the base, used by the editor and by `ts-jest`, and
  includes both `src/` and `test/`. `tsconfig.build.json` extends it and restricts compilation to
  `src/` only, so `npm run build` never emits test files into `dist/`.
