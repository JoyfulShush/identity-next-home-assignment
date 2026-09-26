import Fastify, { FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';
import type { Redis } from 'ioredis';
import qs from 'qs';
import { errorHandler } from './Fastify/errors/errorHandler.js';
import { eventRouter } from './Fastify/Routers/EventRouter.js';
import { createRedisLock } from './redis/createRedisLock.js';

/**
 * Builds and configures the Fastify app instance, wiring up routes and error handling.
 * @param db - The database the app's routes will operate on.
 * @param redis - The Redis client used to build the app's cross-request lock.
 * @returns The configured Fastify instance.
 */
export function buildApp(db: Db, redis: Redis): FastifyInstance {
    const app = Fastify({
        logger: true,
        ajv: {
            customOptions: {
                allErrors: true,
                verbose: true,
                removeAdditional: false,
                coerceTypes: 'array',
            },
        },
        routerOptions: {
            querystringParser: (str) =>
                qs.parse(str, {
                    depth: 1,
                    arrayLimit: 100,
                    allowPrototypes: false,
                    allowDots: false,
                }),
        },
    });

    app.decorate('db', db);
    app.decorate('redisLock', createRedisLock(redis));
    app.setErrorHandler(errorHandler);

    app.get('/health', async () => {
        return { status: 'ok' };
    });

    app.register(eventRouter, { prefix: '/event' });

    return app;
}
