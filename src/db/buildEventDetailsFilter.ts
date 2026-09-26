import type { Filter } from 'mongodb';
import { BadRequestError } from '../Fastify/errors/index.js';
import type { EventDocument } from '../types/db.js';
import type { DateRangeQuery, EventDetailsQueryDto } from '../types/event.js';

/** Parses each value as a date, throwing BadRequestError on the first invalid one. */
function parseDates(values: string[]): Date[] {
    return values.map((value) => {
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
            throw new BadRequestError(`Invalid date value: ${value}`);
        }
        return parsed;
    });
}

/** Returns the latest date in a non-empty list. */
function maxDate(dates: Date[]): Date {
    return new Date(Math.max(...dates.map((date) => date.getTime())));
}

/** Returns the earliest date in a non-empty list. */
function minDate(dates: Date[]): Date {
    return new Date(Math.min(...dates.map((date) => date.getTime())));
}

/**
 * Folds a date-range query (eq/gt/gte/lt/lte, each possibly repeated) into a single
 * Mongo range clause. Repeated values for the same operator AND together (the most
 * restrictive bound wins); `eq` is treated as an inclusive lower and upper bound.
 */
function buildDateRangeClause(range: DateRangeQuery | undefined): Record<string, Date> | undefined {
    if (!range) {
        return undefined;
    }

    const lowerValues: string[] = [];
    if (range.gte?.length) {
        lowerValues.push(...range.gte);
    }
    if (range.eq?.length) {
        lowerValues.push(...range.eq);
    }
    const lowerGte = lowerValues.length > 0 ? maxDate(parseDates(lowerValues)) : undefined;

    const lowerGt = range.gt?.length ? maxDate(parseDates(range.gt)) : undefined;

    const upperValues: string[] = [];
    if (range.lte?.length) {
        upperValues.push(...range.lte);
    }
    if (range.eq?.length) {
        upperValues.push(...range.eq);
    }
    const upperLte = upperValues.length > 0 ? minDate(parseDates(upperValues)) : undefined;

    const upperLt = range.lt?.length ? minDate(parseDates(range.lt)) : undefined;

    const clause: Record<string, Date> = {};

    if (lowerGt && (!lowerGte || lowerGt >= lowerGte)) {
        clause.$gt = lowerGt;
    } else if (lowerGte) {
        clause.$gte = lowerGte;
    }

    if (upperLt && (!upperLte || upperLt <= upperLte)) {
        clause.$lt = upperLt;
    } else if (upperLte) {
        clause.$lte = upperLte;
    }

    return Object.keys(clause).length > 0 ? clause : undefined;
}

/**
 * Builds the Mongo filter for GET /event/:tenantId/details from the validated
 * path/query parameters: tenantId scoping, inclusion whitelists on username/ip/tags,
 * date-range filters, and the isLoggedOut existence check.
 */
export function buildEventDetailsFilter(
    tenantId: string,
    query: EventDetailsQueryDto,
): Filter<EventDocument> {
    const filter: Filter<EventDocument> = { tenantId };

    if (query.username?.length) {
        filter.username = { $in: [...new Set(query.username)] };
    }

    if (query.ip?.length) {
        filter.ip = { $in: [...new Set(query.ip)] };
    }

    if (query.tags?.length) {
        filter.tags = { $in: [...new Set(query.tags)] };
    }

    const createdAtClause = buildDateRangeClause(query.createdAt);
    if (createdAtClause) {
        filter.createdAt = createdAtClause;
    }

    const updatedAtClause = buildDateRangeClause(query.updatedAt);
    if (updatedAtClause) {
        filter.updatedAt = updatedAtClause;
    }

    const loggedOutAtClause: Record<string, Date | boolean> =
        buildDateRangeClause(query.loggedOutAt) ?? {};

    if (query.isLoggedOut !== undefined) {
        loggedOutAtClause.$exists = query.isLoggedOut;
    }

    if (Object.keys(loggedOutAtClause).length > 0) {
        filter.loggedOutAt = loggedOutAtClause;
    }

    return filter;
}
