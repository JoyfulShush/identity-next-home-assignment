import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { EventController } from '../Controllers/EventController.js';
import { eventLoginSchema } from '../../schemas/loginEventSchema.js';
import type { LoginRequest } from '../../types/event.js';

export async function eventRouter(app: FastifyInstance): Promise<void> {
    const eventController = new EventController(app.db);

    app.post(
        '/login',
        { schema: { body: eventLoginSchema } },
        (request: FastifyRequest<LoginRequest>, reply: FastifyReply) =>
            eventController.login(request, reply),
    );
}
