import {
    DEFAULT_LIMIT,
    IPV4_PATTERN,
    IPV6_PATTERN,
    UUID_V4_PATTERN,
    USERNAME_PATTERN,
} from '../db/constants.js';

function multiValue(item: Record<string, unknown>) {
    return { type: 'array', minItems: 1, items: item };
}

const dateItem = { type: 'string', format: 'date-time' };

const dateRangeSchema = {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
        eq: multiValue(dateItem),
        gt: multiValue(dateItem),
        gte: multiValue(dateItem),
        lt: multiValue(dateItem),
        lte: multiValue(dateItem),
    },
};

export const eventDetailsParamsSchema = {
    type: 'object',
    required: ['tenantId'],
    additionalProperties: false,
    properties: {
        tenantId: {
            type: 'string',
            pattern: UUID_V4_PATTERN,
            description: 'UUID4 identifying the organization',
        },
    },
};

export const eventDetailsQuerystringSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        username: multiValue({ type: 'string', pattern: USERNAME_PATTERN }),
        ip: multiValue({
            type: 'string',
            anyOf: [{ pattern: IPV4_PATTERN }, { pattern: IPV6_PATTERN }],
        }),
        tags: multiValue({ type: 'string', minLength: 1 }),
        offset: { type: 'integer', minimum: 0, default: 0 },
        limit: { type: 'integer', minimum: 1, default: DEFAULT_LIMIT },
        isLoggedOut: { type: 'boolean' },
        createdAt: dateRangeSchema,
        updatedAt: dateRangeSchema,
        loggedOutAt: dateRangeSchema,
    },
};
