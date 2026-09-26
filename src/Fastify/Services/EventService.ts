import type { Db, WithId } from 'mongodb';
import { EVENT_COLLECTION } from '../../db/constants.js';
import type { EventDocument } from '../../types/db.js';
import type { LoginEventDto, LoginResult } from '../../types/event.js';

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
}
