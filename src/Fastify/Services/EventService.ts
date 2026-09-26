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

    /**
     * Returns the open session matching tenantId+username+ip, or creates one.
     * @returns The event document, and whether it was newly created.
     */
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

    /**
     * Replaces the tags and updatedAt of the open session matching tenantId+username+ip.
     * @returns The updated event document.
     * @throws {NotFoundError} If no matching open session exists.
     */
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

    /** Sets loggedOutAt on the open session matching tenantId+username+ip, if one exists. */
    async logout(dto: LogoutEventDto): Promise<void> {
        const { tenantId, username, ip, timestamp } = dto;
        const collection = this.db.collection<EventDocument>(EVENT_COLLECTION);

        await collection.updateOne(
            { tenantId, username, ip, loggedOutAt: { $exists: false } },
            { $set: { loggedOutAt: new Date(timestamp) } },
        );
    }
}
