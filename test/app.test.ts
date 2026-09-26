import { buildApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import type { DbHandle } from '../src/types/db.js';

describe('app', () => {
    let dbHandle: DbHandle;

    beforeAll(async () => {
        dbHandle = await connectDb();
    });

    afterAll(async () => {
        await disconnectDb(dbHandle);
    });

    it('responds to GET /health with status ok', async () => {
        const app = buildApp(dbHandle.db);

        const response = await app.inject({ method: 'GET', url: '/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
    });
});
