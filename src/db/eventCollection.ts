import type { Collection, Db } from 'mongodb';
import { EVENT_COLLECTION } from './constants.js';
import { EVENT_JSON_SCHEMA } from './eventSchema.js';
import type { EventDocument } from '../types/db.js';

export { EVENT_COLLECTION };

/**
 * Creates the Event collection with its schema validator if it doesn't exist yet,
 * and ensures its indexes are present. Safe to call repeatedly.
 * @param db - The database to create/access the collection on.
 * @returns The Event collection handle.
 */
export async function ensureEventCollection(db: Db): Promise<Collection<EventDocument>> {
    const existing = await db.listCollections({ name: EVENT_COLLECTION }).toArray();

    if (existing.length === 0) {
        await db.createCollection(EVENT_COLLECTION, {
            validator: { $jsonSchema: EVENT_JSON_SCHEMA },
            validationLevel: 'strict',
            validationAction: 'error',
        });
    }

    const collection = db.collection<EventDocument>(EVENT_COLLECTION);

    await collection.createIndex({ tenantId: 1 });
    await collection.createIndex({ tenantId: 1, username: 1 });
    await collection.createIndex({ tenantId: 1, username: 1, ip: 1 });

    return collection;
}
