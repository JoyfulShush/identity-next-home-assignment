import type { Collection, Db } from 'mongodb';
import { EVENT_COLLECTION } from './constants.js';
import { EVENT_JSON_SCHEMA } from './eventSchema.js';

export { EVENT_COLLECTION };

export interface EventDocument {
    tenantId: string;
    username: string;
    ip: string;
    tags: string[];
    timestamp: Date;
}

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
