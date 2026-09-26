import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from './HttpError.js';
import type { VerboseValidationError, ValidationErrorDetail } from '../../types/errorHandler.js';

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

function valueFromValidationError(error: VerboseValidationError): unknown {
    // For a missing required property or a rejected extra property, "data" is
    // the surrounding object, not a value for the field itself — there is no
    // "bad value" to show the user in either case.
    if (error.keyword === 'required' || error.keyword === 'additionalProperties') {
        return undefined;
    }

    return error.data;
}

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
