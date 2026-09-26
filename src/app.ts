import Fastify, { FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';

export function buildApp(db: Db): FastifyInstance {
    const app = Fastify({ logger: true });

    app.decorate('db', db);

    app.get('/health', async () => {
        return { status: 'ok' };
    });

    return app;
}
