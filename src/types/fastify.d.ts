import type { Db } from 'mongodb';
import type Redlock from 'redlock';

declare module 'fastify' {
    interface FastifyInstance {
        db: Db;
        redisLock: Redlock;
    }
}
