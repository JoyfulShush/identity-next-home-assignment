import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { EventController } from '../Controllers/EventController.js';
import { eventLoginSchema } from '../../schemas/loginEventSchema.js';
import { eventLogoutSchema } from '../../schemas/logoutEventSchema.js';
import type { LoginRequest, LogoutRequest, UpdateRequest } from '../../types/event.js';

/** Registers the routes mounted under the /event prefix. */
export async function eventRouter(app: FastifyInstance): Promise<void> {
    const eventController = new EventController(app.db, app.redisLock);

    app.post(
        '/login',
        { schema: { body: eventLoginSchema } },
        (request: FastifyRequest<LoginRequest>, reply: FastifyReply) =>
            eventController.login(request, reply),
    );

    app.patch(
        '/update',
        { schema: { body: eventLoginSchema } },
        (request: FastifyRequest<UpdateRequest>, reply: FastifyReply) =>
            eventController.update(request, reply),
    );

    app.post(
        '/logout',
        { schema: { body: eventLogoutSchema } },
        (request: FastifyRequest<LogoutRequest>, reply: FastifyReply) =>
            eventController.logout(request, reply),
    );
}
