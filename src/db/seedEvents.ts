import type { Db } from 'mongodb';
import { EVENT_COLLECTION } from './constants.js';
import type { EventDocument } from '../types/db.js';

const TENANT_IDS = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
];

const TAG_POOL = ['vpn', 'admin', 'mobile', 'desktop', 'beta'];
const USERNAMES_PER_TENANT = 10;
const IPS_PER_USERNAME = 2;
const SESSIONS_PER_KEY = 5;
const OPEN_SESSION_KEY_COUNT = 12;

interface SessionKey {
    tenantId: string;
    username: string;
    ip: string;
}

/** Deterministic PRNG (mulberry32), so the seeded dataset is the same on every startup. */
function mulberry32(seed: number): () => number {
    let state = seed;
    return function random(): number {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

/** Picks a random subset of the tag pool, keeping it unique (as the schema requires). */
function randomTags(random: () => number): string[] {
    return TAG_POOL.filter(() => random() < 0.35);
}

/** Builds every distinct tenantId+username+ip combination the seed data will use. */
function buildSessionKeys(): SessionKey[] {
    const keys: SessionKey[] = [];

    TENANT_IDS.forEach((tenantId, tenantIndex) => {
        for (let userIndex = 0; userIndex < USERNAMES_PER_TENANT; userIndex++) {
            const username = `user${String(userIndex).padStart(3, '0')}`;
            for (let ipIndex = 0; ipIndex < IPS_PER_USERNAME; ipIndex++) {
                keys.push({
                    tenantId,
                    username,
                    ip: `10.${tenantIndex}.${userIndex}.${ipIndex + 1}`,
                });
            }
        }
    });

    return keys;
}

/**
 * Generates a deterministic demo dataset across 5 tenants: a realistic session
 * history (several logged-out sessions over time) per tenantId+username+ip, with
 * only a handful of keys left with a currently open (not logged-out) session —
 * never more than one open session per key, matching the login invariant.
 */
export function generateSeedEvents(): EventDocument[] {
    const random = mulberry32(42);
    const keys = buildSessionKeys();

    const openKeyIndexes = new Set<number>();
    while (openKeyIndexes.size < OPEN_SESSION_KEY_COUNT) {
        openKeyIndexes.add(Math.floor(random() * keys.length));
    }

    const events: EventDocument[] = [];
    const stepMs = 6 * 60 * 60 * 1000;
    let cursor = new Date('2024-01-01T00:00:00.000Z').getTime();

    keys.forEach((key, keyIndex) => {
        const leaveOpen = openKeyIndexes.has(keyIndex);

        for (let sessionIndex = 0; sessionIndex < SESSIONS_PER_KEY; sessionIndex++) {
            const isLastSession = sessionIndex === SESSIONS_PER_KEY - 1;

            const createdAt = new Date(cursor);
            cursor += stepMs;
            const updatedAt = new Date(cursor);
            cursor += stepMs;

            const event: EventDocument = {
                ...key,
                tags: randomTags(random),
                createdAt,
                updatedAt,
            };

            if (!(isLastSession && leaveOpen)) {
                event.loggedOutAt = new Date(cursor);
                cursor += stepMs;
            }

            events.push(event);
        }
    });

    return events;
}

/**
 * Seeds the Event collection with the demo dataset, so the service always has
 * realistic data to query right after startup.
 */
export async function seedEvents(db: Db): Promise<void> {
    await db.collection<EventDocument>(EVENT_COLLECTION).insertMany(generateSeedEvents());
}
