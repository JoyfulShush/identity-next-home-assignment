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
