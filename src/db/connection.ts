import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { DbHandle } from '../types/db.js';

const DB_NAME = 'identity-next';

export async function connectDb(): Promise<DbHandle> {
    const mongod = await MongoMemoryServer.create();
    const client = new MongoClient(mongod.getUri());
    await client.connect();
    const db = client.db(DB_NAME);

    return { client, db, mongod };
}

export async function disconnectDb(handle: DbHandle): Promise<void> {
    await handle.client.close();
    await handle.mongod.stop();
}
