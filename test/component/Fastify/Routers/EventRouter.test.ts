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
