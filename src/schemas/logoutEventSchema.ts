import { IPV4_PATTERN, IPV6_PATTERN, UUID_V4_PATTERN, USERNAME_PATTERN } from '../db/constants.js';

export const eventLogoutSchema = {
    type: 'object',
    required: ['tenantId', 'username', 'ip', 'timestamp'],
    additionalProperties: false,
    properties: {
        tenantId: {
            type: 'string',
            pattern: UUID_V4_PATTERN,
            description: 'UUID4 identifying the organization',
        },
        username: {
            type: 'string',
            pattern: USERNAME_PATTERN,
            description: '1 to 64 alphanumeric characters identifying the user',
        },
        ip: {
            type: 'string',
            anyOf: [{ pattern: IPV4_PATTERN }, { pattern: IPV6_PATTERN }],
            description: 'IPv4 or IPv6 address identifying the user',
        },
        timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 date-time the logout occurred',
        },
    },
};
