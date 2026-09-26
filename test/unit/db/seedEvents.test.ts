import { connectDb, disconnectDb } from '../../../src/db/connection.js';
import { EVENT_COLLECTION } from '../../../src/db/constants.js';
import { ensureEventCollection } from '../../../src/db/eventCollection.js';
import { generateSeedEvents, seedEvents } from '../../../src/db/seedEvents.js';
import type { DbHandle } from '../../../src/types/db.js';

describe('seedEvents', () => {
    let dbHandle: DbHandle;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
    });

    afterEach(async () => {
        await dbHandle.db.collection(EVENT_COLLECTION).deleteMany({});
    });

    it('inserts the generated dataset into the Event collection', async () => {
        await seedEvents(dbHandle.db);

        const count = await dbHandle.db.collection(EVENT_COLLECTION).countDocuments();
        expect(count).toBe(generateSeedEvents().length);
    });
});

describe('generateSeedEvents', () => {
    it('generates exactly 500 events across exactly 5 tenants', () => {
        const events = generateSeedEvents();

        expect(events).toHaveLength(500);
        expect(new Set(events.map((event) => event.tenantId)).size).toBe(5);
    });

    it('never leaves more than one open (not logged-out) session per tenantId+username+ip', () => {
        const events = generateSeedEvents();

        const openCountByKey = new Map<string, number>();
        for (const event of events) {
            if (event.loggedOutAt === undefined) {
                const key = `${event.tenantId}-${event.username}-${event.ip}`;
                openCountByKey.set(key, (openCountByKey.get(key) ?? 0) + 1);
            }
        }

        expect([...openCountByKey.values()].every((count) => count === 1)).toBe(true);
    });

    it('leaves a few sessions logged in', () => {
        const events = generateSeedEvents();

        const openCount = events.filter((event) => event.loggedOutAt === undefined).length;

        expect(openCount).toBeGreaterThan(0);
        expect(openCount).toBeLessThan(events.length);
    });

    it('produces documents matching the Event JSON schema constraints', () => {
        const events = generateSeedEvents();

        for (const event of events) {
            expect(event.tenantId).toMatch(/^[0-9a-fA-F-]{36}$/);
            expect(event.username).toMatch(/^[A-Za-z0-9]{1,64}$/);
            expect(event.ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
            expect(new Set(event.tags).size).toBe(event.tags.length);
            expect(event.createdAt.getTime()).toBeLessThanOrEqual(event.updatedAt.getTime());
        }
    });

    it('is deterministic across calls', () => {
        expect(generateSeedEvents()).toEqual(generateSeedEvents());
    });
});
