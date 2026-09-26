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
