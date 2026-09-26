import type { MongoClient, Db } from 'mongodb';
import type { MongoMemoryServer } from 'mongodb-memory-server';

export interface DbHandle {
    client: MongoClient;
    db: Db;
    mongod: MongoMemoryServer;
}

export interface EventDocument {
    tenantId: string;
    username: string;
    ip: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    loggedOutAt?: Date;
}
