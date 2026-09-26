# identity-next-home-assignment

Backend service built with Fastify and TypeScript, for evaluation purposes. Uses MongoDB for
storage and Redis with Redlock for distributed locking, both backed by in-memory mocks so the
app and its tests are fully self-contained. Uses `qs` as Fastify's querystring parser to support
bracket-syntax filters on the session-details endpoint.

## Requirements

- Node.js 24 (see `.nvmrc`)

## Setup

```bash
npm install
```

> **Platform note**: this project has only been run and verified on macOS. `npm install` pulls in
> `mongodb-memory-server`, which downloads a real `mongod` binary matching your OS/architecture on
> first use (it's not a pure-JS mock), so installation on Windows or Linux may hit issues that
> haven't been seen here:
>
> - **No internet access at install/first-run time**: the binary download will fail outright.
>   Make sure the machine can reach `fastdl.mongodb.org` (or a configured mirror), or pre-populate
>   `mongodb-memory-server`'s binary cache from a machine that can.
> - **Alpine Linux / musl-based containers**: the default binary is built for glibc and won't run.
>   Either use a glibc-based image (e.g. `node:24` instead of `node:24-alpine`), or configure
>   `mongodb-memory-server` to download a musl-compatible build (see its
>   [docs](https://typegoose.github.io/mongodb-memory-server/) for the relevant environment
>   variables).
> - **Corporate proxies/firewalls**: if the download is blocked or intercepted, set
>   `MONGOMS_DOWNLOAD_URL`/`MONGOMS_DOWNLOAD_MIRROR` (see the same docs) to point at an internal
>   mirror, or set `MONGOMS_SYSTEM_BINARY` to use a `mongod` already installed on the machine.
> - **Windows**: not tested at all. If `npm install` or `npm start` fails, the error will likely
>   point at the same binary-download step above.

If installation fails for any of these reasons, running the app itself doesn't require Docker or a
real MongoDB server — only the initial binary download needs to succeed once.

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

## Notes

Chosen approach: Redis Lock to control mutations concurrently, and slight schema changes to
support multiple value changes such as document creation, update, and log out. I've considered
using `status` field instead of log out field, but due to the timestamp it self-serves as a
status, and so a `status` field felt redundant.

Queries allow the caller to build a query params based on their needs and a filter is built out of
all of those. I decided to go only for inclusion since it did become complex already.

Assumptions:

- Only one session per (tenantId, username, ip) can be "logged in" at a time
    - Multiple can exist if they are indicated that they were logged out, only one may still be
      logged in though at maximum.
- Sessions never expire.
- Sessions keep a date where they occurred, and when they were last updated.
- Logging into or out of a session that is already logged in or out simply succeeds without doing
  anything
- Updating tags does a full replace of the existing tags with the tags that were sent in the
  update body.
- Updates can only apply to an in-progress session. Sessions that ended cannot be updated via the
  update method.
- Queries are inclusion only (whitelist).

Things I would do if I had more time:

- Logger (pino)
- Docker instance
- Real Mongo DB server
- Real Redis server
- Contract/Integration tests
- Garbage collector: automatically removes sessions that are extremely old (beyond retention
  period)
- Schema to DTOs (for accurate types based on the schema for each route)
- GraphQL
- Supporting blacklisting in queries.

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

## API

All routes are mounted under `/event`.

- `POST /login` — starts a session for a `tenantId`/`username`/`ip` combination, or returns the
  existing one if it's already open.
- `PATCH /update` — replaces the `tags` and `updatedAt` of the open session matching
  `tenantId`/`username`/`ip`.
- `POST /logout` — marks the open session matching `tenantId`/`username`/`ip` as ended.
- `GET /:tenantId/details` — queries stored sessions for a tenant. See below.

### Querying session details

`GET /event/:tenantId/details` returns paginated, filtered session documents for a tenant:

```
GET /event/<tenantId>/details?username=alice&tags=vpn&tags=admin&isLoggedOut=false
    &createdAt[gte]=2024-01-01T00:00:00.000Z&limit=20&offset=0
```

- `username`, `ip`, `tags` — inclusion whitelists. Each can be repeated (`?tags=a&tags=b`) or
  given as a bracket array (`?tags[]=a&tags[]=b`); a document matches if it has _any_ of the
  given values for that field. Different fields are ANDed together.
- `createdAt`, `updatedAt`, `loggedOutAt` — date-range filters, expressed with bracket-operator
  syntax: `eq`, `gt`, `gte`, `lt`, `lte` (e.g. `createdAt[gte]=...&createdAt[lte]=...`). Giving the
  same operator more than once combines them with AND, keeping the most restrictive bound.
- `isLoggedOut` — `true` restricts to sessions that have been logged out, `false` to sessions
  still open, and omitting it includes both.
- `offset` / `limit` — pagination, applied on the database side. `limit` defaults to 50.

The response is `{ items, total }`, where `items` is the current page of matching documents and
`total` is the count of all matches, ignoring pagination.

Because the bracket syntax above isn't supported by Fastify's default querystring parser, this
project configures [`qs`](https://www.npmjs.com/package/qs) as its querystring parser
(`src/app.ts`).

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
