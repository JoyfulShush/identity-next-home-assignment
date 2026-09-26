import type { Redis } from 'ioredis';
import Redlock, { ResourceLockedError } from 'redlock';

/**
 * Builds a Redlock instance configured to retry indefinitely, so callers wait
 * for a busy lock to free up rather than failing fast.
 */
export function createRedisLock(redis: Redis): Redlock {
    const redlock = new Redlock([redis], { retryCount: -1, retryDelay: 50, retryJitter: 50 });

    redlock.on('error', (error) => {
        if (error instanceof ResourceLockedError) {
            return;
        }
        console.error(error);
    });

    return redlock;
}
