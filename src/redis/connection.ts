import type { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';

/** Creates a fresh in-memory Redis client. */
export function connectRedis(): Redis {
    return new RedisMock();
}

/** Closes the Redis client connection. */
export async function disconnectRedis(redis: Redis): Promise<void> {
    await redis.quit();
}
