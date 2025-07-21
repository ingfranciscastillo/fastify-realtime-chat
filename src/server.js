import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import fastifyJwt from "@fastify/jwt";
import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import messageRoutes from "./routes/messages.js";
import * as websocketManager from "./services/webSocketManager.js";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
});
await fastify.register(fastifyWebsocket);
await fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
});

// Middleware de autenticación
fastify.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ success: false, message: "No autorizado" });
  }
});

fastify.register(authRoutes, { prefix: "/auth" });
fastify.register(roomRoutes, { prefix: "/rooms" });
fastify.register(messageRoutes, { prefix: "/messages" });

fastify.get("/", (req, reply) => {
  reply.send({ hello: "world" });
});

// Endpoint WebSocket para chat en tiempo real
fastify.get("/ws", { websocket: true }, (socket, req) => {
  websocketManager.handleConnection(socket, req);
});

const start = async () => {
  try {
    await fastify.listen({ port: 5000 });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
