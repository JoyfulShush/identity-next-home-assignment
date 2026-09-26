import { buildEventDetailsFilter } from '../../../src/db/buildEventDetailsFilter.js';
import { BadRequestError } from '../../../src/Fastify/errors/index.js';
import type { EventDetailsQueryDto } from '../../../src/types/event.js';

const TENANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function baseQuery(overrides: Partial<EventDetailsQueryDto> = {}): EventDetailsQueryDto {
    return { offset: 0, limit: 50, ...overrides };
}

describe('buildEventDetailsFilter', () => {
    it('returns just the tenantId filter when the query is empty', () => {
        expect(buildEventDetailsFilter(TENANT_ID, baseQuery())).toEqual({ tenantId: TENANT_ID });
    });

    it('builds $in for a single and multiple username/ip/tags values, deduped', () => {
        expect(
            buildEventDetailsFilter(TENANT_ID, baseQuery({ username: ['alice'] })),
        ).toMatchObject({ username: { $in: ['alice'] } });

        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({ ip: ['127.0.0.1', '127.0.0.1', '10.0.0.1'] }),
            ),
        ).toMatchObject({ ip: { $in: ['127.0.0.1', '10.0.0.1'] } });

        expect(
            buildEventDetailsFilter(TENANT_ID, baseQuery({ tags: ['vpn', 'admin'] })),
        ).toMatchObject({ tags: { $in: ['vpn', 'admin'] } });
    });

    it('maps isLoggedOut true/false to $exists, and omits it when unset', () => {
        expect(buildEventDetailsFilter(TENANT_ID, baseQuery({ isLoggedOut: true }))).toMatchObject({
            loggedOutAt: { $exists: true },
        });

        expect(buildEventDetailsFilter(TENANT_ID, baseQuery({ isLoggedOut: false }))).toMatchObject(
            { loggedOutAt: { $exists: false } },
        );

        expect(buildEventDetailsFilter(TENANT_ID, baseQuery()).loggedOutAt).toBeUndefined();
    });

    it('builds single-bound range clauses', () => {
        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({ createdAt: { gte: ['2024-01-01T00:00:00.000Z'] } }),
            ),
        ).toMatchObject({ createdAt: { $gte: new Date('2024-01-01T00:00:00.000Z') } });

        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({ createdAt: { lte: ['2024-06-01T00:00:00.000Z'] } }),
            ),
        ).toMatchObject({ createdAt: { $lte: new Date('2024-06-01T00:00:00.000Z') } });
    });

    it('takes the max of repeated gte values and the min of repeated lte values', () => {
        const result = buildEventDetailsFilter(
            TENANT_ID,
            baseQuery({
                createdAt: {
                    gte: ['2024-01-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'],
                    lte: ['2024-06-01T00:00:00.000Z', '2024-04-01T00:00:00.000Z'],
                },
            }),
        );

        expect(result).toMatchObject({
            createdAt: {
                $gte: new Date('2024-03-01T00:00:00.000Z'),
                $lte: new Date('2024-04-01T00:00:00.000Z'),
            },
        });
    });

    it('prefers the stricter of gt/gte, and lt/lte, including on ties', () => {
        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({
                    createdAt: {
                        gt: ['2024-03-01T00:00:00.000Z'],
                        gte: ['2024-01-01T00:00:00.000Z'],
                    },
                }),
            ),
        ).toMatchObject({ createdAt: { $gt: new Date('2024-03-01T00:00:00.000Z') } });

        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({
                    createdAt: {
                        gt: ['2024-01-01T00:00:00.000Z'],
                        gte: ['2024-01-01T00:00:00.000Z'],
                    },
                }),
            ),
        ).toMatchObject({ createdAt: { $gt: new Date('2024-01-01T00:00:00.000Z') } });

        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({
                    createdAt: {
                        lt: ['2024-01-01T00:00:00.000Z'],
                        lte: ['2024-03-01T00:00:00.000Z'],
                    },
                }),
            ),
        ).toMatchObject({ createdAt: { $lt: new Date('2024-01-01T00:00:00.000Z') } });
    });

    it('treats eq as a symmetric gte/lte bound, still narrowed by a stricter explicit bound', () => {
        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({ createdAt: { eq: ['2024-03-01T00:00:00.000Z'] } }),
            ),
        ).toMatchObject({
            createdAt: {
                $gte: new Date('2024-03-01T00:00:00.000Z'),
                $lte: new Date('2024-03-01T00:00:00.000Z'),
            },
        });

        expect(
            buildEventDetailsFilter(
                TENANT_ID,
                baseQuery({
                    createdAt: {
                        eq: ['2024-03-01T00:00:00.000Z'],
                        gte: ['2024-01-01T00:00:00.000Z'],
                    },
                }),
            ),
        ).toMatchObject({
            createdAt: {
                $gte: new Date('2024-03-01T00:00:00.000Z'),
                $lte: new Date('2024-03-01T00:00:00.000Z'),
            },
        });
    });

    it('produces an unsatisfiable range for two conflicting eq values', () => {
        const result = buildEventDetailsFilter(
            TENANT_ID,
            baseQuery({
                createdAt: { eq: ['2024-01-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z'] },
            }),
        );

        const clause = result.createdAt as { $gte: Date; $lte: Date };
        expect(clause.$gte.getTime()).toBeGreaterThan(clause.$lte.getTime());
    });

    it('merges a loggedOutAt range with isLoggedOut without overwriting either', () => {
        const result = buildEventDetailsFilter(
            TENANT_ID,
            baseQuery({
                loggedOutAt: { gte: ['2024-01-01T00:00:00.000Z'] },
                isLoggedOut: true,
            }),
        );

        expect(result).toMatchObject({
            loggedOutAt: {
                $gte: new Date('2024-01-01T00:00:00.000Z'),
                $exists: true,
            },
        });
    });

    it('combines all fields together', () => {
        const result = buildEventDetailsFilter(
            TENANT_ID,
            baseQuery({
                username: ['alice'],
                ip: ['127.0.0.1'],
                tags: ['vpn'],
                isLoggedOut: false,
                createdAt: { gte: ['2024-01-01T00:00:00.000Z'] },
                updatedAt: { lte: ['2024-06-01T00:00:00.000Z'] },
            }),
        );

        expect(result).toMatchObject({
            tenantId: TENANT_ID,
            username: { $in: ['alice'] },
            ip: { $in: ['127.0.0.1'] },
            tags: { $in: ['vpn'] },
            loggedOutAt: { $exists: false },
            createdAt: { $gte: new Date('2024-01-01T00:00:00.000Z') },
            updatedAt: { $lte: new Date('2024-06-01T00:00:00.000Z') },
        });
    });

    it('omits the field entirely when a range object has no operators set', () => {
        const result = buildEventDetailsFilter(TENANT_ID, baseQuery({ createdAt: {} }));

        expect(result.createdAt).toBeUndefined();
    });

    it('throws BadRequestError for an invalid date value', () => {
        expect(() =>
            buildEventDetailsFilter(TENANT_ID, baseQuery({ createdAt: { gte: ['not-a-date'] } })),
        ).toThrow(BadRequestError);
    });
});
