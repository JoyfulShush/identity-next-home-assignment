import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { DbHandle } from '../types/db.js';

const DB_NAME = 'identity-next';

/**
 * Spins up an in-memory MongoDB instance and connects a client to it.
 * @returns The connected client, database, and in-memory server handles.
 */
export async function connectDb(): Promise<DbHandle> {
    const mongod = await MongoMemoryServer.create();
    const client = new MongoClient(mongod.getUri());
    await client.connect();
    const db = client.db(DB_NAME);

    return { client, db, mongod };
}

/**
 * Closes the client connection and stops the in-memory MongoDB instance.
 * @param handle - The handle returned by {@link connectDb}.
 */
export async function disconnectDb(handle: DbHandle): Promise<void> {
    await handle.client.close();
    await handle.mongod.stop();
}
