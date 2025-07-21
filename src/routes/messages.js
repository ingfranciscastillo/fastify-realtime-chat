import { z } from "zod";
import * as messageService from "../services/messageService.js";
import { broadcastToRoom } from "../services/webSocketManager.js";

// Esquemas de validación
const createMessageSchema = z.object({
  content: z.string().min(1),
  roomId: z.string().min(1),
  messageType: z.string().optional(),
  replyToId: z.string().optional().nullable(),
});

const updateMessageSchema = z.object({
  content: z.string().min(1),
});

export default async function messageRoutes(fastify) {
  // Crear mensaje
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const validatedData = createMessageSchema.parse(request.body);
        const message = await messageService.createMessage({
          ...validatedData,
          senderId: request.user.userId,
        });
        // Notificar a la sala por WebSocket
        broadcastToRoom(validatedData.roomId, {
          type: "new_message",
          data: { message, roomId: validatedData.roomId },
        });
        reply.code(201).send({
          success: true,
          message: "Mensaje creado exitosamente",
          data: { message },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Obtener mensajes de una sala
  fastify.get(
    "/room/:roomId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { roomId } = request.params;
        const { before, limit } = request.query;
        const messages = await messageService.getRoomMessages(roomId, {
          before,
          limit: limit ? Number(limit) : undefined,
        });
        reply.send({
          success: true,
          data: { messages },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Obtener un mensaje por ID
  fastify.get(
    "/:messageId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const message = await messageService.getMessageById(messageId);
        if (!message) {
          return reply.code(404).send({
            success: false,
            message: "Mensaje no encontrado",
          });
        }
        reply.send({
          success: true,
          data: { message },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Actualizar mensaje
  fastify.put(
    "/:messageId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const validatedData = updateMessageSchema.parse(request.body);
        const updated = await messageService.updateMessage(
          messageId,
          validatedData.content,
          request.user.userId
        );
        // Notificar a la sala por WebSocket
        if (updated && updated.roomId) {
          broadcastToRoom(updated.roomId, {
            type: "message_edited",
            data: { message: updated, roomId: updated.roomId },
          });
        }
        reply.send({
          success: true,
          message: "Mensaje actualizado",
          data: { message: updated },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Eliminar mensaje (soft delete)
  fastify.delete(
    "/:messageId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const deleted = await messageService.deleteMessage(
          messageId,
          request.user.userId
        );
        // Notificar a la sala por WebSocket
        if (deleted && deleted.roomId) {
          broadcastToRoom(deleted.roomId, {
            type: "message_deleted",
            data: { message: deleted, roomId: deleted.roomId },
          });
        }
        reply.send({
          success: true,
          message: "Mensaje eliminado",
          data: { message: deleted },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Obtener respuestas a un mensaje
  fastify.get(
    "/:messageId/replies",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const replies = await messageService.getMessageReplies(messageId);
        reply.send({
          success: true,
          data: { replies },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Buscar mensajes en una sala
  fastify.get(
    "/room/:roomId/search",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { roomId } = request.params;
        const { q, limit } = request.query;
        if (!q) {
          return reply.code(400).send({
            success: false,
            message: "El parámetro de búsqueda 'q' es requerido",
          });
        }
        const results = await messageService.searchMessages(roomId, q, {
          limit: limit ? Number(limit) : undefined,
        });
        reply.send({
          success: true,
          data: { results },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );
}
