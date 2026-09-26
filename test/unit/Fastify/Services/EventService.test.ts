import type { Redis } from 'ioredis';
import { connectDb, disconnectDb } from '../../../../src/db/connection.js';
import { ensureEventCollection } from '../../../../src/db/eventCollection.js';
import { connectRedis, disconnectRedis } from '../../../../src/redis/connection.js';
import { createRedisLock } from '../../../../src/redis/createRedisLock.js';
import { EventService } from '../../../../src/Fastify/Services/EventService.js';
import { NotFoundError } from '../../../../src/Fastify/errors/index.js';
import type { DbHandle } from '../../../../src/types/db.js';
import type { LoginEventDto, LogoutEventDto, UpdateEventDto } from '../../../../src/types/event.js';

const VALID_TENANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function validLoginDto(overrides: Partial<LoginEventDto> = {}): LoginEventDto {
    return {
        tenantId: VALID_TENANT_ID,
        username: 'alice123',
        ip: '127.0.0.1',
        tags: ['login', 'vpn'],
        timestamp: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function validUpdateDto(overrides: Partial<UpdateEventDto> = {}): UpdateEventDto {
    return {
        tenantId: VALID_TENANT_ID,
        username: 'alice123',
        ip: '127.0.0.1',
        tags: ['vpn'],
        timestamp: '2024-06-01T00:00:00.000Z',
        ...overrides,
    };
}

function validLogoutDto(overrides: Partial<LogoutEventDto> = {}): LogoutEventDto {
    return {
        tenantId: VALID_TENANT_ID,
        username: 'alice123',
        ip: '127.0.0.1',
        timestamp: '2024-06-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('EventService.login', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let eventService: EventService;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        redis = connectRedis();
        eventService = new EventService(dbHandle.db, createRedisLock(redis));
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    afterEach(async () => {
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('creates a new document when no matching open session exists', async () => {
        const dto = validLoginDto();
        const result = await eventService.login(dto);

        expect(result).toMatchObject({
            created: true,
            event: {
                tenantId: dto.tenantId,
                username: dto.username,
                ip: dto.ip,
                tags: dto.tags,
                createdAt: new Date(dto.timestamp),
                updatedAt: new Date(dto.timestamp),
            },
        });
        expect(result.event._id).toBeDefined();
        expect(result.event.loggedOutAt).toBeUndefined();
    });

    it('returns the existing document when an open session already matches tenantId+username+ip', async () => {
        const dto = validLoginDto();
        const first = await eventService.login(dto);

        const second = await eventService.login(
            validLoginDto({ timestamp: '2024-06-01T00:00:00.000Z' }),
        );

        expect(second).toMatchObject({
            created: false,
            event: {
                _id: first.event._id,
                createdAt: first.event.createdAt,
            },
        });
    });

    it('creates a new document when a prior session with the same key was logged out', async () => {
        const dto = validLoginDto();
        const first = await eventService.login(dto);
        await dbHandle.db
            .collection('Event')
            .updateOne({ _id: first.event._id }, { $set: { loggedOutAt: new Date() } });

        const second = await eventService.login(
            validLoginDto({ timestamp: '2024-06-01T00:00:00.000Z' }),
        );

        expect(second).toMatchObject({ created: true });
        expect(second.event._id).not.toEqual(first.event._id);
    });

    it('treats different ips for the same tenantId+username as separate sessions', async () => {
        const first = await eventService.login(validLoginDto({ ip: '127.0.0.1' }));
        const second = await eventService.login(validLoginDto({ ip: '192.168.1.1' }));

        expect(first).toMatchObject({ created: true });
        expect(second).toMatchObject({ created: true });
        expect(second.event._id).not.toEqual(first.event._id);
    });

    it('is locked per tenantId+username+ip: concurrent logins for the same session create only one document', async () => {
        const dto = validLoginDto();

        const [first, second] = await Promise.all([
            eventService.login(dto),
            eventService.login(dto),
        ]);

        expect([first.created, second.created].sort()).toEqual([false, true]);
        expect(first.event._id).toEqual(second.event._id);

        const count = await dbHandle.db.collection('Event').countDocuments({
            tenantId: dto.tenantId,
            username: dto.username,
            ip: dto.ip,
        });
        expect(count).toBe(1);
    });
});

describe('EventService.update', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let eventService: EventService;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        redis = connectRedis();
        eventService = new EventService(dbHandle.db, createRedisLock(redis));
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    afterEach(async () => {
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('replaces the tags and updatedAt of the matching open session', async () => {
        const { event: existing } = await eventService.login(validLoginDto());

        const updateDto = validUpdateDto({ tags: ['admin'] });
        const updated = await eventService.update(updateDto);

        expect(updated).toMatchObject({
            _id: existing._id,
            tenantId: existing.tenantId,
            username: existing.username,
            ip: existing.ip,
            tags: ['admin'],
            createdAt: existing.createdAt,
            updatedAt: new Date(updateDto.timestamp),
        });
    });

    it('throws NotFoundError when no session matches tenantId+username+ip', async () => {
        await expect(eventService.update(validUpdateDto())).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the matching session was already logged out', async () => {
        const { event: existing } = await eventService.login(validLoginDto());
        await dbHandle.db
            .collection('Event')
            .updateOne({ _id: existing._id }, { $set: { loggedOutAt: new Date() } });

        await expect(eventService.update(validUpdateDto())).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the ip does not match the open session', async () => {
        await eventService.login(validLoginDto({ ip: '127.0.0.1' }));

        await expect(eventService.update(validUpdateDto({ ip: '192.168.1.1' }))).rejects.toThrow(
            NotFoundError,
        );
    });

    it('is locked per tenantId+username+ip: concurrent updates for the same session leave a consistent final state', async () => {
        const { event: existing } = await eventService.login(validLoginDto());

        const [first, second] = await Promise.all([
            eventService.update(validUpdateDto({ tags: ['first'] })),
            eventService.update(validUpdateDto({ tags: ['second'] })),
        ]);

        expect(first._id).toEqual(existing._id);
        expect(second._id).toEqual(existing._id);

        const stored = await dbHandle.db.collection('Event').findOne({ _id: existing._id });
        expect([['first'], ['second']]).toContainEqual(stored?.tags);

        const count = await dbHandle.db.collection('Event').countDocuments({
            tenantId: existing.tenantId,
            username: existing.username,
            ip: existing.ip,
        });
        expect(count).toBe(1);
    });
});

describe('EventService.logout', () => {
    let dbHandle: DbHandle;
    let redis: Redis;
    let eventService: EventService;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        redis = connectRedis();
        eventService = new EventService(dbHandle.db, createRedisLock(redis));
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
        await disconnectRedis(redis);
    });

    afterEach(async () => {
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('sets loggedOutAt on the matching open session', async () => {
        const { event: existing } = await eventService.login(validLoginDto());

        const logoutDto = validLogoutDto();
        await eventService.logout(logoutDto);

        const stored = await dbHandle.db.collection('Event').findOne({ _id: existing._id });
        expect(stored).toMatchObject({ loggedOutAt: new Date(logoutDto.timestamp) });
    });

    it('resolves without error when no session matches tenantId+username+ip', async () => {
        await expect(eventService.logout(validLogoutDto())).resolves.toBeUndefined();
    });

    it('does not affect a session that was already logged out', async () => {
        const { event: existing } = await eventService.login(validLoginDto());
        const firstLogoutAt = new Date('2024-03-01T00:00:00.000Z');
        await dbHandle.db
            .collection('Event')
            .updateOne({ _id: existing._id }, { $set: { loggedOutAt: firstLogoutAt } });

        await eventService.logout(validLogoutDto());

        const stored = await dbHandle.db.collection('Event').findOne({ _id: existing._id });
        expect(stored).toMatchObject({ loggedOutAt: firstLogoutAt });
    });

    it('does not affect a session with a different ip', async () => {
        const { event: existing } = await eventService.login(validLoginDto({ ip: '127.0.0.1' }));

        await eventService.logout(validLogoutDto({ ip: '192.168.1.1' }));

        const stored = await dbHandle.db.collection('Event').findOne({ _id: existing._id });
        expect(stored?.loggedOutAt).toBeUndefined();
    });

    it('is locked per tenantId+username+ip: concurrent logouts for the same session set loggedOutAt exactly once, consistently', async () => {
        const { event: existing } = await eventService.login(validLoginDto());

        const firstTimestamp = '2024-06-01T00:00:00.000Z';
        const secondTimestamp = '2024-07-01T00:00:00.000Z';

        await Promise.all([
            eventService.logout(validLogoutDto({ timestamp: firstTimestamp })),
            eventService.logout(validLogoutDto({ timestamp: secondTimestamp })),
        ]);

        const stored = await dbHandle.db.collection('Event').findOne({ _id: existing._id });
        expect([new Date(firstTimestamp), new Date(secondTimestamp)]).toContainEqual(
            stored?.loggedOutAt,
        );

        const count = await dbHandle.db.collection('Event').countDocuments({
            tenantId: existing.tenantId,
            username: existing.username,
            ip: existing.ip,
        });
        expect(count).toBe(1);
    });
});
