import type { Db, WithId } from 'mongodb';
import type Redlock from 'redlock';
import { EVENT_COLLECTION } from '../../db/constants.js';
import { LOCK_DURATION_MS } from '../../redis/constants.js';
import { NotFoundError } from '../errors/index.js';
import type { EventDocument } from '../../types/db.js';
import type {
    LoginEventDto,
    LoginResult,
    LogoutEventDto,
    SessionIdentifier,
    UpdateEventDto,
} from '../../types/event.js';

export class EventService {
    constructor(
        private readonly db: Db,
        private readonly redisLock: Redlock,
    ) {}

    private sessionLockKey({ tenantId, username, ip }: SessionIdentifier): string {
        return `tenant-${tenantId}-username-${username}-ip-${ip}`;
    }

    /**
     * Returns the open session matching tenantId+username+ip, or creates one.
     * Locked per tenantId+username+ip to avoid racing concurrent calls.
     * @returns The event document, and whether it was newly created.
     */
    async login(dto: LoginEventDto): Promise<LoginResult> {
        return this.redisLock.using([this.sessionLockKey(dto)], LOCK_DURATION_MS, async () => {
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
        });
    }

    /**
     * Replaces the tags and updatedAt of the open session matching tenantId+username+ip.
     * Locked per tenantId+username+ip to avoid racing concurrent calls.
     * @returns The updated event document.
     * @throws {NotFoundError} If no matching open session exists.
     */
    async update(dto: UpdateEventDto): Promise<WithId<EventDocument>> {
        return this.redisLock.using([this.sessionLockKey(dto)], LOCK_DURATION_MS, async () => {
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
        });
    }

    /**
     * Sets loggedOutAt on the open session matching tenantId+username+ip, if one exists.
     * Locked per tenantId+username+ip to avoid racing concurrent calls.
     */
    async logout(dto: LogoutEventDto): Promise<void> {
        return this.redisLock.using([this.sessionLockKey(dto)], LOCK_DURATION_MS, async () => {
            const { tenantId, username, ip, timestamp } = dto;
            const collection = this.db.collection<EventDocument>(EVENT_COLLECTION);

            await collection.updateOne(
                { tenantId, username, ip, loggedOutAt: { $exists: false } },
                { $set: { loggedOutAt: new Date(timestamp) } },
            );
        });
    }
}
