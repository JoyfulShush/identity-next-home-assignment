import { buildApp } from './app.js';
import { connectDb, disconnectDb } from './db/connection.js';
import { ensureEventCollection } from './db/eventCollection.js';
import type { DbHandle } from './types/db.js';

const PORT = 4000;

/** Connects to the database, builds the app, and starts listening on PORT. */
async function main(): Promise<void> {
    const dbHandle: DbHandle = await connectDb();
    await ensureEventCollection(dbHandle.db);

    const app = buildApp(dbHandle.db);

    const shutdown = async (): Promise<void> => {
        await app.close();
        await disconnectDb(dbHandle);
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
