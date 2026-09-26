import { IPV4_PATTERN, IPV6_PATTERN, UUID_V4_PATTERN, USERNAME_PATTERN } from './constants.js';

export const EVENT_JSON_SCHEMA = {
    bsonType: 'object',
    required: ['tenantId', 'username', 'ip', 'tags', 'timestamp'],
    additionalProperties: false,
    properties: {
        _id: {},
        tenantId: {
            bsonType: 'string',
            pattern: UUID_V4_PATTERN,
            description: 'UUID4 identifying the organization',
        },
        username: {
            bsonType: 'string',
            pattern: USERNAME_PATTERN,
            description: '1 to 64 alphanumeric characters identifying the user',
        },
        ip: {
            bsonType: 'string',
            anyOf: [{ pattern: IPV4_PATTERN }, { pattern: IPV6_PATTERN }],
            description: 'IPv4 or IPv6 address identifying the user',
        },
        tags: {
            bsonType: 'array',
            uniqueItems: true,
            items: {
                bsonType: 'string',
            },
            description: 'Unique string tags for the event, may be empty',
        },
        timestamp: {
            bsonType: 'date',
            description: 'Date and time the event occurred',
        },
    },
};
