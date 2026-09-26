import { jest } from '@jest/globals';
import { ResourceLockedError } from 'redlock';
import { connectRedis, disconnectRedis } from '../../../src/redis/connection.js';
import { createRedisLock } from '../../../src/redis/createRedisLock.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('createRedisLock', () => {
    it('serializes concurrent using() calls for the same key', async () => {
        const redis = connectRedis();
        const redisLock = createRedisLock(redis);
        const order: string[] = [];

        const first = redisLock.using(['key-a'], 1000, async () => {
            order.push('first-start');
            await delay(50);
            order.push('first-end');
        });

        await delay(10);

        const second = redisLock.using(['key-a'], 1000, async () => {
            order.push('second-start');
            order.push('second-end');
        });

        await Promise.all([first, second]);

        expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);

        await redisLock.quit();
        await disconnectRedis(redis);
    });

    it('silently ignores ResourceLockedError events emitted during normal contention', async () => {
        const redis = connectRedis();
        const redisLock = createRedisLock(redis);
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        redisLock.emit('error', new ResourceLockedError('locked'));

        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
        await redisLock.quit();
        await disconnectRedis(redis);
    });

    it('logs any other error emitted by the underlying redlock instance', async () => {
        const redis = connectRedis();
        const redisLock = createRedisLock(redis);
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('unexpected redis failure');

        redisLock.emit('error', error);

        expect(consoleErrorSpy).toHaveBeenCalledWith(error);

        consoleErrorSpy.mockRestore();
        await redisLock.quit();
        await disconnectRedis(redis);
    });
});
