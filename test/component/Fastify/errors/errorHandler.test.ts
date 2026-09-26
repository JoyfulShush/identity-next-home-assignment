import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { buildApp } from '../../../../src/app.js';
import { connectDb, disconnectDb } from '../../../../src/db/connection.js';
import { connectRedis, disconnectRedis } from '../../../../src/redis/connection.js';
import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    HttpError,
    NotFoundError,
    UnauthorizedError,
} from '../../../../src/Fastify/errors/index.js';
import type { DbHandle } from '../../../../src/types/db.js';

describe('errorHandler', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let app: FastifyInstance;

    beforeAll(async () => {
        dbHandle = await connectDb();
        redis = connectRedis();
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    beforeEach(() => {
        app = buildApp(dbHandle.db, redis);

        app.get(
            '/__test/validated',
            {
                schema: {
                    querystring: {
                        type: 'object',
                        required: ['username'],
                        additionalProperties: false,
                        properties: {
                            username: { type: 'string', pattern: '^[A-Za-z0-9]{1,64}$' },
                        },
                    },
                },
            },
            async () => ({ ok: true }),
        );

        app.get('/__test/http-error/:kind', async (request) => {
            const { kind } = request.params as { kind: string };

            switch (kind) {
                case 'bad-request':
                    throw new BadRequestError('username is reserved');
                case 'unauthorized':
                    throw new UnauthorizedError('missing credentials');
                case 'forbidden':
                    throw new ForbiddenError('not allowed');
                case 'not-found':
                    throw new NotFoundError('event not found');
                case 'conflict':
                    throw new ConflictError('event already exists');
                case 'raw-http-error':
                    throw new HttpError(422, 'custom status without a named subclass');
                default:
                    throw new Error('unknown kind');
            }
        });

        app.get('/__test/sync-throw', () => {
            throw new Error('sensitive internal detail');
        });

        app.get('/__test/async-throw', async () => {
            throw new Error('sensitive internal detail');
        });

        app.get('/__test/throw-non-error', () => {
            throw 'a plain string, not an Error instance';
        });

        app.post(
            '/__test/validated-body',
            {
                schema: {
                    body: {
                        type: 'object',
                        required: ['tenantId'],
                        additionalProperties: false,
                        properties: {
                            tenantId: { type: 'string', pattern: '^[0-9a-f-]{36}$' },
                        },
                    },
                },
            },
            async () => ({ ok: true }),
        );

        // Manufactures FastifyError-shaped objects to exercise validation-error edge
        // cases (an empty instancePath for a root-level failure, and a missing ajv
        // "message") that are impractical to trigger through real ajv validation.
        app.get('/__test/raw-validation-error/:kind', async (request) => {
            const { kind } = request.params as { kind: string };

            if (kind === 'empty-instance-path') {
                throw Object.assign(new Error('root validation failure'), {
                    code: 'FST_ERR_VALIDATION',
                    validation: [
                        {
                            keyword: 'type',
                            instancePath: '',
                            schemaPath: '#/type',
                            params: { type: 'object' },
                            message: 'must be object',
                        },
                    ],
                });
            }

            if (kind === 'no-message') {
                throw Object.assign(new Error('validation failure without a message'), {
                    code: 'FST_ERR_VALIDATION',
                    validation: [
                        {
                            keyword: 'custom',
                            instancePath: '/username',
                            schemaPath: '#/properties/username/custom',
                            params: {},
                        },
                    ],
                });
            }

            throw new Error('unknown kind');
        });
    });

    afterEach(async () => {
        await app.close();
    });

    describe('schema validation errors', () => {
        it('returns 400 with the failing field, reason, and bad value for an invalid field', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/__test/validated?username=not valid!',
            });

            expect(response).toMatchObject({ statusCode: 400 });
            const body = response.json();
            expect(body).toMatchObject({ message: 'Bad User Input' });
            expect(body.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        field: 'username',
                        value: 'not valid!',
                    }),
                ]),
            );
            expect(body.errors[0].message).toEqual(expect.any(String));
        });

        it('returns 400 naming a missing required field, with no value', async () => {
            const response = await app.inject({ method: 'GET', url: '/__test/validated' });

            expect(response).toMatchObject({ statusCode: 400 });
            const body = response.json();
            const usernameError = body.errors.find(
                (error: { field: string }) => error.field === 'username',
            );
            expect(usernameError).toBeDefined();
            expect(usernameError.value).toBeUndefined();
        });

        it('returns 400 for an unexpected extra query parameter', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/__test/validated?username=alice&extra=1',
            });

            expect(response).toMatchObject({ statusCode: 400 });
            const body = response.json();
            expect(body.errors).toEqual(
                expect.arrayContaining([expect.objectContaining({ field: 'extra' })]),
            );
        });

        it('reports every failing field at once, not just the first', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/__test/validated?username=not valid!&extra=1',
            });

            expect(response).toMatchObject({ statusCode: 400 });
            const body = response.json();
            expect(body.errors).toHaveLength(2);
            expect(body.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'username' }),
                    expect.objectContaining({ field: 'extra' }),
                ]),
            );
        });

        it('validates the request body the same way it validates the query string', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/__test/validated-body',
                payload: {},
            });

            expect(response).toMatchObject({ statusCode: 400 });
            const body = response.json();
            expect(body.errors).toEqual(
                expect.arrayContaining([expect.objectContaining({ field: 'tenantId' })]),
            );
        });

        it('treats an empty instancePath as the field name for a root-level failure', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/__test/raw-validation-error/empty-instance-path',
            });

            expect(response).toMatchObject({ statusCode: 400 });
            const body = response.json();
            expect(body.errors).toEqual([
                expect.objectContaining({ field: '', message: 'must be object' }),
            ]);
        });

        it('falls back to a generic message when ajv provides none', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/__test/raw-validation-error/no-message',
            });

            expect(response).toMatchObject({ statusCode: 400 });
            const body = response.json();
            expect(body.errors).toEqual([
                expect.objectContaining({ field: 'username', message: 'is invalid' }),
            ]);
        });
    });

    describe('intentionally thrown HttpErrors', () => {
        it.each([
            ['bad-request', 400, 'username is reserved'],
            ['unauthorized', 401, 'missing credentials'],
            ['forbidden', 403, 'not allowed'],
            ['not-found', 404, 'event not found'],
            ['conflict', 409, 'event already exists'],
        ])('maps %s to status %i with { message }', async (kind, statusCode, message) => {
            const response = await app.inject({ method: 'GET', url: `/__test/http-error/${kind}` });

            expect(response).toMatchObject({ statusCode });
            expect(response.json()).toEqual({ message });
        });

        it('also handles a plain HttpError with no named subclass', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/__test/http-error/raw-http-error',
            });

            expect(response).toMatchObject({ statusCode: 422 });
            expect(response.json()).toEqual({
                message: 'custom status without a named subclass',
            });
        });
    });

    describe('unexpected errors', () => {
        it('returns a generic 500 body for a synchronous throw, hiding the real message', async () => {
            const response = await app.inject({ method: 'GET', url: '/__test/sync-throw' });

            expect(response).toMatchObject({ statusCode: 500 });
            expect(response.json()).toEqual({ message: 'Internal Server Error' });
        });

        it('returns a generic 500 body for a rejected async handler, hiding the real message', async () => {
            const response = await app.inject({ method: 'GET', url: '/__test/async-throw' });

            expect(response).toMatchObject({ statusCode: 500 });
            expect(response.json()).toEqual({ message: 'Internal Server Error' });
        });

        it('returns a generic 500 body even for a non-Error thrown value', async () => {
            const response = await app.inject({ method: 'GET', url: '/__test/throw-non-error' });

            expect(response).toMatchObject({ statusCode: 500 });
            expect(response.json()).toEqual({ message: 'Internal Server Error' });
        });
    });
});
