import Fastify from "fastify";
import cors from "@fastify/cors";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors);

fastify.get("/", (req, replay) => {
  replay.send({ hello: "world" });
});

await fastify.listen({ port: 5000 });
