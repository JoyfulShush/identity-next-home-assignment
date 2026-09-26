import type { WithId } from 'mongodb';
import type { EventDocument } from './db.js';

export interface LoginEventDto {
    tenantId: string;
    username: string;
    ip: string;
    tags: string[];
    timestamp: string;
}

export interface LoginResult {
    event: WithId<EventDocument>;
    created: boolean;
}

export interface LoginRequest {
    Body: LoginEventDto;
}

export interface UpdateEventDto {
    tenantId: string;
    username: string;
    ip: string;
    tags: string[];
    timestamp: string;
}

export interface UpdateRequest {
    Body: UpdateEventDto;
}

export interface LogoutEventDto {
    tenantId: string;
    username: string;
    ip: string;
    timestamp: string;
}

export interface LogoutRequest {
    Body: LogoutEventDto;
}

export interface SessionIdentifier {
    tenantId: string;
    username: string;
    ip: string;
}

export interface EventDetailsParams {
    tenantId: string;
}

export interface DateRangeQuery {
    eq?: string[];
    gt?: string[];
    gte?: string[];
    lt?: string[];
    lte?: string[];
}

export interface EventDetailsQueryDto {
    username?: string[];
    ip?: string[];
    tags?: string[];
    offset: number;
    limit: number;
    isLoggedOut?: boolean;
    createdAt?: DateRangeQuery;
    updatedAt?: DateRangeQuery;
    loggedOutAt?: DateRangeQuery;
}

export interface EventDetailsRequest {
    Params: EventDetailsParams;
    Querystring: EventDetailsQueryDto;
}

export interface EventDetailsResult {
    items: WithId<EventDocument>[];
    total: number;
}
