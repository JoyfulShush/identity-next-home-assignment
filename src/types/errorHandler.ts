import type { FastifySchemaValidationError } from 'fastify';

// Present when Fastify's ajv instance is configured with `verbose: true`;
// not part of Fastify's own type definitions.
export type VerboseValidationError = FastifySchemaValidationError & { data?: unknown };

export interface ValidationErrorDetail {
    field: string;
    message: string;
    value: unknown;
}
