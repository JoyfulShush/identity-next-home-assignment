import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from 'mongodb';
import { EventService } from '../Services/EventService.js';
import { HttpStatusCode } from '../constants.js';
import type { LoginRequest, LogoutRequest, UpdateRequest } from '../../types/event.js';

export class EventController {
    private readonly eventService: EventService;

    constructor(db: Db) {
        this.eventService = new EventService(db);
    }

    /** Handles POST /event/login: replies 201 with a new document, or 200 with the existing one. */
    async login(request: FastifyRequest<LoginRequest>, reply: FastifyReply): Promise<void> {
        const { event, created } = await this.eventService.login(request.body);
        reply.status(created ? HttpStatusCode.CREATED : HttpStatusCode.OK).send(event);
    }

    /** Handles PATCH /event/update: replies 200 with the updated document. */
    async update(request: FastifyRequest<UpdateRequest>, reply: FastifyReply): Promise<void> {
        const event = await this.eventService.update(request.body);
        reply.status(HttpStatusCode.OK).send(event);
    }

    /** Handles POST /event/logout: replies 204 with no content. */
    async logout(request: FastifyRequest<LogoutRequest>, reply: FastifyReply): Promise<void> {
        await this.eventService.logout(request.body);
        reply.status(HttpStatusCode.NO_CONTENT).send();
    }
}
