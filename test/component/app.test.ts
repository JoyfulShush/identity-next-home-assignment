import type { Redis } from 'ioredis';
import { buildApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/db/connection.js';
import { connectRedis, disconnectRedis } from '../../src/redis/connection.js';
import type { DbHandle } from '../../src/types/db.js';

describe('app', () => {
    let dbHandle: DbHandle;
    let redis: Redis;

    beforeAll(async () => {
        dbHandle = await connectDb();
        redis = connectRedis();
    });

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    it('responds to GET /health with status ok', async () => {
        const app = buildApp(dbHandle.db, redis);

        const response = await app.inject({ method: 'GET', url: '/health' });

        expect(response).toMatchObject({ statusCode: 200 });
        expect(response.json()).toMatchObject({ status: 'ok' });
    });
});
