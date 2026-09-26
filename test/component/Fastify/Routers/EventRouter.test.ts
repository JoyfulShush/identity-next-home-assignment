import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { ObjectId } from 'mongodb';
import { buildApp } from '../../../../src/app.js';
import { connectDb, disconnectDb } from '../../../../src/db/connection.js';
import { ensureEventCollection } from '../../../../src/db/eventCollection.js';
import { connectRedis, disconnectRedis } from '../../../../src/redis/connection.js';
import type { DbHandle } from '../../../../src/types/db.js';

const VALID_TENANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function validBody(overrides: Record<string, unknown> = {}) {
    return {
        tenantId: VALID_TENANT_ID,
        username: 'alice123',
        ip: '127.0.0.1',
        tags: ['login', 'vpn'],
        timestamp: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function validLogoutBody(overrides: Record<string, unknown> = {}) {
    return {
        tenantId: VALID_TENANT_ID,
        username: 'alice123',
        ip: '127.0.0.1',
        timestamp: '2024-06-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('POST /event/login', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let app: FastifyInstance;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        redis = connectRedis();
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    beforeEach(() => {
        app = buildApp(dbHandle.db, redis);
    });

    afterEach(async () => {
        await app.close();
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('returns 201 with the created document on the first login', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody(),
        });

        expect(response).toMatchObject({ statusCode: 201 });
        const body = response.json();
        expect(body).toMatchObject({
            tenantId: VALID_TENANT_ID,
            username: 'alice123',
            ip: '127.0.0.1',
            tags: ['login', 'vpn'],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
        });
        expect(body._id).toBeDefined();
    });

    it('returns 200 with the existing document on a repeated login for the same session', async () => {
        const first = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody(),
        });

        const second = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody({ timestamp: '2024-06-01T00:00:00.000Z' }),
        });

        expect(second).toMatchObject({ statusCode: 200 });
        expect(second.json()).toMatchObject({ _id: first.json()._id });
    });

    it('returns 400 with field details for an invalid body', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody({ tenantId: 'not-a-uuid' }),
        });

        expect(response).toMatchObject({ statusCode: 400 });
        const body = response.json();
        expect(body.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'tenantId' })]),
        );
    });

    it('returns 400 for a missing required field', async () => {
        const { timestamp, ...payload } = validBody();

        const response = await app.inject({ method: 'POST', url: '/event/login', payload });

        expect(response).toMatchObject({ statusCode: 400 });
        const body = response.json();
        expect(body.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'timestamp' })]),
        );
    });

    it('returns 400 for a timestamp that is not a valid date-time', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody({ timestamp: 'not-a-date' }),
        });

        expect(response).toMatchObject({ statusCode: 400 });
        const body = response.json();
        expect(body.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'timestamp' })]),
        );
    });

    it('returns 400 for an unexpected extra property', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody({ extra: 'nope' }),
        });

        expect(response).toMatchObject({ statusCode: 400 });
        const body = response.json();
        expect(body.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'extra' })]),
        );
    });
});

describe('PATCH /event/update', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let app: FastifyInstance;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        redis = connectRedis();
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    beforeEach(() => {
        app = buildApp(dbHandle.db, redis);
    });

    afterEach(async () => {
        await app.close();
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('returns 200 with the updated document when a matching open session exists', async () => {
        const login = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody(),
        });

        const response = await app.inject({
            method: 'PATCH',
            url: '/event/update',
            payload: validBody({ tags: ['admin'], timestamp: '2024-06-01T00:00:00.000Z' }),
        });

        expect(response).toMatchObject({ statusCode: 200 });
        expect(response.json()).toMatchObject({
            _id: login.json()._id,
            tags: ['admin'],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-06-01T00:00:00.000Z',
        });
    });

    it('returns 404 when there is no in-progress session to update', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: '/event/update',
            payload: validBody(),
        });

        expect(response).toMatchObject({ statusCode: 404 });
        expect(response.json()).toMatchObject({
            message: 'No in-progress session found for the given tenantId, username, and ip',
        });
    });

    it('returns 404 when the matching session was already logged out', async () => {
        const login = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody(),
        });
        await dbHandle.db
            .collection('Event')
            .updateOne(
                { _id: new ObjectId(login.json()._id) },
                { $set: { loggedOutAt: new Date() } },
            );

        const response = await app.inject({
            method: 'PATCH',
            url: '/event/update',
            payload: validBody(),
        });

        expect(response).toMatchObject({ statusCode: 404 });
    });

    it('returns 400 with field details for an invalid body', async () => {
        const response = await app.inject({
            method: 'PATCH',
            url: '/event/update',
            payload: validBody({ tenantId: 'not-a-uuid' }),
        });

        expect(response).toMatchObject({ statusCode: 400 });
        const body = response.json();
        expect(body.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'tenantId' })]),
        );
    });
});

describe('POST /event/logout', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let app: FastifyInstance;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        redis = connectRedis();
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    beforeEach(() => {
        app = buildApp(dbHandle.db, redis);
    });

    afterEach(async () => {
        await app.close();
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('returns 204 and sets loggedOutAt on the matching open session', async () => {
        const login = await app.inject({
            method: 'POST',
            url: '/event/login',
            payload: validBody(),
        });

        const response = await app.inject({
            method: 'POST',
            url: '/event/logout',
            payload: validLogoutBody(),
        });

        expect(response).toMatchObject({ statusCode: 204, body: '' });

        const stored = await dbHandle.db
            .collection('Event')
            .findOne({ _id: new ObjectId(login.json()._id) });
        expect(stored).toMatchObject({ loggedOutAt: new Date('2024-06-01T00:00:00.000Z') });
    });

    it('returns 204 when there is no matching session', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/event/logout',
            payload: validLogoutBody(),
        });

        expect(response).toMatchObject({ statusCode: 204, body: '' });
    });

    it('returns 400 with field details for an invalid body', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/event/logout',
            payload: validLogoutBody({ tenantId: 'not-a-uuid' }),
        });

        expect(response).toMatchObject({ statusCode: 400 });
        const body = response.json();
        expect(body.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'tenantId' })]),
        );
    });

    it('returns 400 for an unexpected extra property', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/event/logout',
            payload: validLogoutBody({ tags: ['nope'] }),
        });

        expect(response).toMatchObject({ statusCode: 400 });
        const body = response.json();
        expect(body.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: 'tags' })]),
        );
    });
});

describe('GET /event/:tenantId/details', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let app: FastifyInstance;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        redis = connectRedis();
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    beforeEach(() => {
        app = buildApp(dbHandle.db, redis);
    });

    afterEach(async () => {
        await app.close();
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('returns 200 with an envelope, defaulting to a limit of 50', async () => {
        await dbHandle.db.collection('Event').insertMany(
            Array.from({ length: 60 }, (_, index) => ({
                tenantId: VALID_TENANT_ID,
                username: `user${index}`,
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            })),
        );

        const response = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details`,
        });

        expect(response).toMatchObject({ statusCode: 200 });
        const body = response.json();
        expect(body.total).toBe(60);
        expect(body.items).toHaveLength(50);
    });

    it('filters via the createdAt[gte]/createdAt[lte] bracket syntax', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-06-01T00:00:00.000Z'),
                updatedAt: new Date('2024-06-01T00:00:00.000Z'),
            },
        ]);

        const response = await app.inject({
            method: 'GET',
            url:
                `/event/${VALID_TENANT_ID}/details` +
                '?createdAt[gte]=2024-03-01T00:00:00.000Z&createdAt[lte]=2024-12-01T00:00:00.000Z',
        });

        expect(response).toMatchObject({ statusCode: 200 });
        const body = response.json();
        expect(body.total).toBe(1);
        expect(body.items[0]).toMatchObject({ username: 'bob456' });
    });

    it('ANDs repeated bracket values for the same operator', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-06-01T00:00:00.000Z'),
                updatedAt: new Date('2024-06-01T00:00:00.000Z'),
            },
        ]);

        const response = await app.inject({
            method: 'GET',
            url:
                `/event/${VALID_TENANT_ID}/details` +
                '?createdAt[gte]=2024-01-01T00:00:00.000Z&createdAt[gte]=2024-03-01T00:00:00.000Z',
        });

        expect(response).toMatchObject({ statusCode: 200 });
        const body = response.json();
        expect(body.total).toBe(1);
        expect(body.items[0]).toMatchObject({ username: 'bob456' });
    });

    it('accepts both repeated keys and bracket-array syntax for tags, and a single value', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: ['vpn'],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: ['admin'],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
        ]);

        const repeated = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?tags=vpn&tags=admin`,
        });
        expect(repeated.json().total).toBe(2);

        const bracketed = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?tags[]=vpn&tags[]=admin`,
        });
        expect(bracketed.json().total).toBe(2);

        const single = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?tags=vpn`,
        });
        expect(single.json().total).toBe(1);
    });

    it('coerces isLoggedOut true/false over HTTP', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
                loggedOutAt: new Date('2024-01-02T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
        ]);

        const loggedOut = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?isLoggedOut=true`,
        });
        expect(loggedOut.json()).toMatchObject({ total: 1 });
        expect(loggedOut.json().items[0]).toMatchObject({ username: 'alice123' });

        const active = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?isLoggedOut=false`,
        });
        expect(active.json()).toMatchObject({ total: 1 });
        expect(active.json().items[0]).toMatchObject({ username: 'bob456' });
    });

    it('returns the second page via limit/offset, non-overlapping with the first, in _id order', async () => {
        await dbHandle.db.collection('Event').insertMany(
            Array.from({ length: 5 }, (_, index) => ({
                tenantId: VALID_TENANT_ID,
                username: `user${index}`,
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            })),
        );

        const firstPage = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?limit=2&offset=0`,
        });
        const secondPage = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?limit=2&offset=2`,
        });

        expect(firstPage.json()).toMatchObject({ total: 5 });
        expect(secondPage.json()).toMatchObject({ total: 5 });
        expect(firstPage.json().items.map((item: { username: string }) => item.username)).toEqual([
            'user0',
            'user1',
        ]);
        expect(secondPage.json().items.map((item: { username: string }) => item.username)).toEqual([
            'user2',
            'user3',
        ]);
    });

    it('returns the full, correctly-serialized document shape in items', async () => {
        await dbHandle.db.collection('Event').insertOne({
            tenantId: VALID_TENANT_ID,
            username: 'alice123',
            ip: '127.0.0.1',
            tags: ['vpn', 'admin'],
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            updatedAt: new Date('2024-02-01T00:00:00.000Z'),
            loggedOutAt: new Date('2024-03-01T00:00:00.000Z'),
        });

        const response = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details`,
        });

        expect(response).toMatchObject({ statusCode: 200 });
        const body = response.json();
        expect(body.total).toBe(1);
        expect(body.items).toHaveLength(1);
        expect(body.items[0]).toMatchObject({
            tenantId: VALID_TENANT_ID,
            username: 'alice123',
            ip: '127.0.0.1',
            tags: ['vpn', 'admin'],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-02-01T00:00:00.000Z',
            loggedOutAt: '2024-03-01T00:00:00.000Z',
        });
        expect(body.items[0]._id).toBeDefined();
    });

    it('filters by username as a single value and as a bracket-array whitelist', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
        ]);

        const single = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?username=alice123`,
        });
        expect(single.json()).toMatchObject({ total: 1 });
        expect(single.json().items[0]).toMatchObject({ username: 'alice123' });

        const bracketed = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?username[]=alice123&username[]=bob456`,
        });
        expect(bracketed.json()).toMatchObject({ total: 2 });
    });

    it('filters by ip as a single value and as a bracket-array whitelist', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '192.168.1.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
        ]);

        const single = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?ip=127.0.0.1`,
        });
        expect(single.json()).toMatchObject({ total: 1 });
        expect(single.json().items[0]).toMatchObject({ username: 'alice123' });

        const bracketed = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details?ip[]=127.0.0.1&ip[]=192.168.1.1`,
        });
        expect(bracketed.json()).toMatchObject({ total: 2 });
    });

    it('combines username, tags, and a createdAt range in a single request (AND across fields)', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: ['vpn'],
                createdAt: new Date('2024-06-01T00:00:00.000Z'),
                updatedAt: new Date('2024-06-01T00:00:00.000Z'),
            },
            {
                // same username+tags but outside the date range
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: ['vpn'],
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                updatedAt: new Date('2023-01-01T00:00:00.000Z'),
            },
            {
                // in range, but wrong username
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: ['vpn'],
                createdAt: new Date('2024-06-01T00:00:00.000Z'),
                updatedAt: new Date('2024-06-01T00:00:00.000Z'),
            },
        ]);

        const response = await app.inject({
            method: 'GET',
            url:
                `/event/${VALID_TENANT_ID}/details` +
                '?username=alice123&tags=vpn&createdAt[gte]=2024-01-01T00:00:00.000Z',
        });

        expect(response).toMatchObject({ statusCode: 200 });
        expect(response.json()).toMatchObject({ total: 1 });
        expect(response.json().items[0]).toMatchObject({
            username: 'alice123',
            createdAt: '2024-06-01T00:00:00.000Z',
        });
    });

    it('filters via the updatedAt range', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-06-01T00:00:00.000Z'),
            },
        ]);

        const response = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details` + '?updatedAt[gte]=2024-03-01T00:00:00.000Z',
        });

        expect(response).toMatchObject({ statusCode: 200 });
        expect(response.json()).toMatchObject({ total: 1 });
        expect(response.json().items[0]).toMatchObject({ username: 'bob456' });
    });

    it('filters via the loggedOutAt range', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
                loggedOutAt: new Date('2024-01-02T00:00:00.000Z'),
            },
            {
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
                loggedOutAt: new Date('2024-06-01T00:00:00.000Z'),
            },
        ]);

        const response = await app.inject({
            method: 'GET',
            url: `/event/${VALID_TENANT_ID}/details` + '?loggedOutAt[gte]=2024-03-01T00:00:00.000Z',
        });

        expect(response).toMatchObject({ statusCode: 200 });
        expect(response.json()).toMatchObject({ total: 1 });
        expect(response.json().items[0]).toMatchObject({ username: 'bob456' });
    });

    it('combines isLoggedOut with a loggedOutAt range without either overwriting the other', async () => {
        await dbHandle.db.collection('Event').insertMany([
            {
                // logged out, but before the range: should be excluded by the range
                tenantId: VALID_TENANT_ID,
                username: 'alice123',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
                loggedOutAt: new Date('2024-01-02T00:00:00.000Z'),
            },
            {
                // logged out, inside the range: should match
                tenantId: VALID_TENANT_ID,
                username: 'bob456',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
                loggedOutAt: new Date('2024-06-01T00:00:00.000Z'),
            },
            {
                // still active (no loggedOutAt): should be excluded by isLoggedOut=true
                // regardless of the range
                tenantId: VALID_TENANT_ID,
                username: 'carol789',
                ip: '127.0.0.1',
                tags: [],
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
            },
        ]);

        const response = await app.inject({
            method: 'GET',
            url:
                `/event/${VALID_TENANT_ID}/details` +
                '?isLoggedOut=true&loggedOutAt[gte]=2024-03-01T00:00:00.000Z',
        });

        expect(response).toMatchObject({ statusCode: 200 });
        expect(response.json()).toMatchObject({ total: 1 });
        expect(response.json().items[0]).toMatchObject({ username: 'bob456' });
    });

    it.each([
        ['bad tenantId', `/event/not-a-uuid/details`],
        ['limit=0', `/event/${VALID_TENANT_ID}/details?limit=0`],
        ['limit=-1', `/event/${VALID_TENANT_ID}/details?limit=-1`],
        ['limit=abc', `/event/${VALID_TENANT_ID}/details?limit=abc`],
        ['limit=1.5', `/event/${VALID_TENANT_ID}/details?limit=1.5`],
        ['limit given twice', `/event/${VALID_TENANT_ID}/details?limit=5&limit=6`],
        ['offset=-1', `/event/${VALID_TENANT_ID}/details?offset=-1`],
        ['isLoggedOut=yes', `/event/${VALID_TENANT_ID}/details?isLoggedOut=yes`],
        [
            'createdAt[gte] not a date',
            `/event/${VALID_TENANT_ID}/details?createdAt[gte]=not-a-date`,
        ],
        [
            'createdAt[gte] date without time',
            `/event/${VALID_TENANT_ID}/details?createdAt[gte]=2024-01-01`,
        ],
        ['createdAt[foo] unknown operator', `/event/${VALID_TENANT_ID}/details?createdAt[foo]=x`],
        [
            'nested bracket beyond depth 1',
            `/event/${VALID_TENANT_ID}/details?createdAt[gte][x]=2024-01-01T00:00:00.000Z`,
        ],
        [
            'bare createdAt (not an object)',
            `/event/${VALID_TENANT_ID}/details?createdAt=2024-01-01T00:00:00.000Z`,
        ],
        ['unknown query param', `/event/${VALID_TENANT_ID}/details?foo=bar`],
        ['empty username', `/event/${VALID_TENANT_ID}/details?username=`],
        ['invalid ip', `/event/${VALID_TENANT_ID}/details?ip=999.1.1.1`],
        ['empty tags', `/event/${VALID_TENANT_ID}/details?tags=`],
    ])('returns 400 for %s', async (_case, url) => {
        const response = await app.inject({ method: 'GET', url });

        expect(response).toMatchObject({ statusCode: 400 });
        expect(response.json()).toMatchObject({ message: 'Bad User Input' });
    });
});
