import { connectDb, disconnectDb } from '../../../../src/db/connection.js';
import { ensureEventCollection } from '../../../../src/db/eventCollection.js';
import { EventService } from '../../../../src/Fastify/Services/EventService.js';
import type { DbHandle } from '../../../../src/types/db.js';
import type { LoginEventDto } from '../../../../src/types/event.js';

const VALID_TENANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function validDto(overrides: Partial<LoginEventDto> = {}): LoginEventDto {
    return {
        tenantId: VALID_TENANT_ID,
        username: 'alice123',
        ip: '127.0.0.1',
        tags: ['login', 'vpn'],
        timestamp: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('EventService.login', () => {
    let dbHandle: DbHandle;
    let eventService: EventService;

    beforeAll(async () => {
        dbHandle = await connectDb();
        await ensureEventCollection(dbHandle.db);
        eventService = new EventService(dbHandle.db);
    }, 5000);

    afterAll(async () => {
        await disconnectDb(dbHandle);
    });

    afterEach(async () => {
        await dbHandle.db.collection('Event').deleteMany({});
    });

    it('creates a new document when no matching open session exists', async () => {
        const dto = validDto();
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
        const dto = validDto();
        const first = await eventService.login(dto);

        const second = await eventService.login(
            validDto({ timestamp: '2024-06-01T00:00:00.000Z' }),
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
        const dto = validDto();
        const first = await eventService.login(dto);
        await dbHandle.db
            .collection('Event')
            .updateOne({ _id: first.event._id }, { $set: { loggedOutAt: new Date() } });

        const second = await eventService.login(
            validDto({ timestamp: '2024-06-01T00:00:00.000Z' }),
        );

        expect(second).toMatchObject({ created: true });
        expect(second.event._id).not.toEqual(first.event._id);
    });

    it('treats different ips for the same tenantId+username as separate sessions', async () => {
        const first = await eventService.login(validDto({ ip: '127.0.0.1' }));
        const second = await eventService.login(validDto({ ip: '192.168.1.1' }));

        expect(first).toMatchObject({ created: true });
        expect(second).toMatchObject({ created: true });
        expect(second.event._id).not.toEqual(first.event._id);
    });
});
