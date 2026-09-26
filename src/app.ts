import Fastify, { FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';
import { errorHandler } from './Fastify/errors/errorHandler.js';
import { eventRouter } from './Fastify/Routers/EventRouter.js';

export function buildApp(db: Db): FastifyInstance {
    const app = Fastify({
        logger: true,
        ajv: {
            customOptions: {
                allErrors: true,
                verbose: true,
                removeAdditional: false,
            },
        },
    });

    app.decorate('db', db);
    app.setErrorHandler(errorHandler);

    app.get('/health', async () => {
        return { status: 'ok' };
    });

    app.register(eventRouter, { prefix: '/event' });

    return app;
}
