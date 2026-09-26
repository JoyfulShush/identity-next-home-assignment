import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../../src/app.js';
import { connectDb, disconnectDb } from '../../../../src/db/connection.js';
import { ensureEventCollection } from '../../../../src/db/eventCollection.js';
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

describe('POST /event/login', () => {
    let dbHandle: DbHandle;
    let app: FastifyInstance;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
    });

    beforeEach(() => {
        app = buildApp(dbHandle.db);
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
