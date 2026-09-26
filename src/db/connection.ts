import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

export interface DbHandle {
    client: MongoClient;
    db: Db;
    mongod: MongoMemoryServer;
}

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
