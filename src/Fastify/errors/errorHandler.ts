import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from './HttpError.js';
import type { VerboseValidationError, ValidationErrorDetail } from '../../types/errorHandler.js';

/**
 * Extracts the offending field name from an ajv validation error.
 * @param error - The ajv validation error.
 * @returns The field name, or an empty string for a root-level failure.
 */
function fieldFromValidationError(error: VerboseValidationError): string {
    if (error.keyword === 'required') {
        return String(error.params.missingProperty);
    }

    if (error.keyword === 'additionalProperties') {
        return String(error.params.additionalProperty);
    }

    const { instancePath } = error;
    return instancePath.startsWith('/') ? instancePath.slice(1) : instancePath;
}

/**
 * Extracts the rejected value from an ajv validation error, for display to the caller.
 * @param error - The ajv validation error.
 * @returns The bad value, or undefined when there is none to show.
 */
function valueFromValidationError(error: VerboseValidationError): unknown {
    // For a missing required property or a rejected extra property, "data" is
    // the surrounding object, not a value for the field itself — there is no
    // "bad value" to show the user in either case.
    if (error.keyword === 'required' || error.keyword === 'additionalProperties') {
        return undefined;
    }

    return error.data;
}

/**
 * Centralized Fastify error handler: maps validation errors to 400s, HttpErrors
 * to their own status code, and anything else to a generic 500 (logging the
 * real error rather than exposing it).
 * @param error - The error thrown/rejected by a route handler.
 * @param request - The request that triggered the error, used for logging.
 * @param reply - The reply used to send the resulting response.
 */
export function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
): void {
    if (error.validation) {
        const errors: ValidationErrorDetail[] = error.validation.map((validationError) => ({
            field: fieldFromValidationError(validationError),
            message: validationError.message ?? 'is invalid',
            value: valueFromValidationError(validationError),
        }));

        reply.status(400).send({ message: 'Bad User Input', errors });
        return;
    }

    if (error instanceof HttpError) {
        reply.status(error.statusCode).send({ message: error.message });
        return;
    }

    request.log.error(error);
    reply.status(500).send({ message: 'Internal Server Error' });
}
