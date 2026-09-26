import type { Collection } from 'mongodb';
import { connectDb, disconnectDb, type DbHandle } from '../../src/db/connection.js';
import {
    EVENT_COLLECTION,
    ensureEventCollection,
    type EventDocument,
} from '../../src/db/eventCollection.js';

const VALID_TENANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function validEvent(overrides: Partial<EventDocument> = {}): EventDocument {
    return {
        tenantId: VALID_TENANT_ID,
        username: 'alice123',
        ip: '127.0.0.1',
        tags: ['login', 'vpn'],
        timestamp: new Date(),
        ...overrides,
    };
}

describe('Event collection', () => {
    let dbHandle: DbHandle;
    let collection: Collection<EventDocument>;
    // Untyped handle onto the same collection, used only for negative tests whose
    // documents intentionally don't conform to the EventDocument shape.
    let rawCollection: Collection;

    beforeAll(async () => {
        dbHandle = await connectDb();
        collection = await ensureEventCollection(dbHandle.db);
        rawCollection = dbHandle.db.collection(EVENT_COLLECTION);
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
    });

    it('creates the tenantId, tenantId+username, and tenantId+username+ip indexes', async () => {
        const indexes = await dbHandle.db.collection(EVENT_COLLECTION).indexes();
        const indexKeys = indexes.map((index) => index.key);

        expect(indexKeys).toContainEqual({ tenantId: 1 });
        expect(indexKeys).toContainEqual({ tenantId: 1, username: 1 });
        expect(indexKeys).toContainEqual({ tenantId: 1, username: 1, ip: 1 });
    });

    it('is idempotent when called again on an existing collection', async () => {
        await expect(ensureEventCollection(dbHandle.db)).resolves.toBeDefined();
    });

    it('accepts a fully valid event document', async () => {
        const result = await collection.insertOne(validEvent());

        expect(result.acknowledged).toBe(true);
    });

    describe('tenantId', () => {
        it('rejects a non-UUID value', async () => {
            await expect(
                collection.insertOne(validEvent({ tenantId: 'not-a-uuid' })),
            ).rejects.toThrow();
        });

        it('rejects a UUID that is not version 4', async () => {
            await expect(
                collection.insertOne(
                    validEvent({ tenantId: '3fa85f64-5717-1562-b3fc-2c963f66afa6' }),
                ),
            ).rejects.toThrow();
        });
    });

    describe('username', () => {
        it('rejects an empty string', async () => {
            await expect(collection.insertOne(validEvent({ username: '' }))).rejects.toThrow();
        });

        it('rejects non-alphanumeric characters', async () => {
            await expect(
                collection.insertOne(validEvent({ username: 'alice_123' })),
            ).rejects.toThrow();
        });

        it('rejects a value longer than 64 characters', async () => {
            await expect(
                collection.insertOne(validEvent({ username: 'a'.repeat(65) })),
            ).rejects.toThrow();
        });

        it('accepts a single character', async () => {
            const result = await collection.insertOne(validEvent({ username: 'a' }));
            expect(result.acknowledged).toBe(true);
        });

        it('accepts exactly 64 characters', async () => {
            const result = await collection.insertOne(validEvent({ username: 'a'.repeat(64) }));
            expect(result.acknowledged).toBe(true);
        });
    });

    describe('ip', () => {
        it('accepts a valid IPv4 address', async () => {
            const result = await collection.insertOne(validEvent({ ip: '192.168.1.1' }));
            expect(result.acknowledged).toBe(true);
        });

        it('accepts a valid IPv6 address', async () => {
            const result = await collection.insertOne(validEvent({ ip: '2001:db8::1' }));
            expect(result.acknowledged).toBe(true);
        });

        it('rejects an invalid address', async () => {
            await expect(
                collection.insertOne(validEvent({ ip: '999.999.999.999' })),
            ).rejects.toThrow();
        });

        it('rejects a non-IP string', async () => {
            await expect(collection.insertOne(validEvent({ ip: 'not-an-ip' }))).rejects.toThrow();
        });
    });

    describe('tags', () => {
        it('accepts an empty array', async () => {
            const result = await collection.insertOne(validEvent({ tags: [] }));
            expect(result.acknowledged).toBe(true);
        });

        it('accepts unique tags', async () => {
            const result = await collection.insertOne(validEvent({ tags: ['login', 'vpn'] }));
            expect(result.acknowledged).toBe(true);
        });

        it('rejects duplicate tags', async () => {
            await expect(
                collection.insertOne(validEvent({ tags: ['login', 'login'] })),
            ).rejects.toThrow();
        });
    });

    describe('timestamp', () => {
        it('rejects a string instead of a date', async () => {
            await expect(
                rawCollection.insertOne({
                    ...validEvent(),
                    timestamp: '2024-01-01T00:00:00.000Z',
                }),
            ).rejects.toThrow();
        });

        it('accepts a valid date', async () => {
            const result = await collection.insertOne(validEvent({ timestamp: new Date() }));
            expect(result.acknowledged).toBe(true);
        });
    });

    describe('required fields', () => {
        it('rejects a document missing tenantId', async () => {
            const { tenantId, ...event } = validEvent();
            await expect(rawCollection.insertOne(event)).rejects.toThrow();
        });

        it('rejects a document missing username', async () => {
            const { username, ...event } = validEvent();
            await expect(rawCollection.insertOne(event)).rejects.toThrow();
        });

        it('rejects a document missing ip', async () => {
            const { ip, ...event } = validEvent();
            await expect(rawCollection.insertOne(event)).rejects.toThrow();
        });

        it('rejects a document missing tags', async () => {
            const { tags, ...event } = validEvent();
            await expect(rawCollection.insertOne(event)).rejects.toThrow();
        });

        it('rejects a document missing timestamp', async () => {
            const { timestamp, ...event } = validEvent();
            await expect(rawCollection.insertOne(event)).rejects.toThrow();
        });
    });

    describe('unknown fields', () => {
        it('rejects a document with an unexpected extra property', async () => {
            await expect(
                rawCollection.insertOne({
                    ...validEvent(),
                    extra: 'not allowed',
                }),
            ).rejects.toThrow();
        });
    });
});
