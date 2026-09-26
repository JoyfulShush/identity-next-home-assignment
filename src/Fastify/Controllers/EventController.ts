import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from 'mongodb';
import { EventService } from '../Services/EventService.js';
import { HttpStatusCode } from '../constants.js';
import type { LoginRequest } from '../../types/event.js';

export class EventController {
    private readonly eventService: EventService;

    constructor(db: Db) {
        this.eventService = new EventService(db);
    }

    async login(request: FastifyRequest<LoginRequest>, reply: FastifyReply): Promise<void> {
        const { event, created } = await this.eventService.login(request.body);
        reply.status(created ? HttpStatusCode.CREATED : HttpStatusCode.OK).send(event);
    }
}
