import type { Db, WithId } from 'mongodb';
import { EVENT_COLLECTION } from '../../db/constants.js';
import { NotFoundError } from '../errors/index.js';
import type { EventDocument } from '../../types/db.js';
import type {
    LoginEventDto,
    LoginResult,
    LogoutEventDto,
    UpdateEventDto,
} from '../../types/event.js';

export class EventService {
    constructor(private readonly db: Db) {}

    async login(dto: LoginEventDto): Promise<LoginResult> {
        const { tenantId, username, ip, tags, timestamp } = dto;
        const collection = this.db.collection<EventDocument>(EVENT_COLLECTION);

        const existing = await collection.findOne({
            tenantId,
            username,
            ip,
            loggedOutAt: { $exists: false },
        });

        if (existing) {
            return { event: existing, created: false };
        }

        const timestampDate = new Date(timestamp);

        const newEvent: EventDocument = {
            tenantId,
            username,
            ip,
            tags,
            createdAt: timestampDate,
            updatedAt: timestampDate,
        };

        const { insertedId } = await collection.insertOne(newEvent);
        const event: WithId<EventDocument> = { _id: insertedId, ...newEvent };

        return { event, created: true };
    }

    async update(dto: UpdateEventDto): Promise<WithId<EventDocument>> {
        const { tenantId, username, ip, tags, timestamp } = dto;
        const collection = this.db.collection<EventDocument>(EVENT_COLLECTION);

        const updated = await collection.findOneAndUpdate(
            { tenantId, username, ip, loggedOutAt: { $exists: false } },
            { $set: { tags, updatedAt: new Date(timestamp) } },
            { returnDocument: 'after' },
        );

        if (!updated) {
            throw new NotFoundError(
                'No in-progress session found for the given tenantId, username, and ip',
            );
        }

        return updated;
    }

    async logout(dto: LogoutEventDto): Promise<void> {
        const { tenantId, username, ip, timestamp } = dto;
        const collection = this.db.collection<EventDocument>(EVENT_COLLECTION);

        await collection.updateOne(
            { tenantId, username, ip, loggedOutAt: { $exists: false } },
            { $set: { loggedOutAt: new Date(timestamp) } },
        );
    }
}
