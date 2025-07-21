import { z } from "zod";
import * as roomService from "../services/roomService.js";
import * as messageService from "../services/messageService.js";
import * as websocketManager from "../services/webSocketManager.js";

// Esquemas de validación
const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
});

const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
});

export default async function roomRoutes(fastify) {
  // Crear sala
  fastify.post(
    "/",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string", maxLength: 500 },
            isPrivate: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const validatedData = createRoomSchema.parse(request.body);
        const room = await roomService.createRoom(
          validatedData,
          request.user.userId
        );

        reply.code(201).send({
          success: true,
          message: "Sala creada exitosamente",
          data: { room },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Obtener salas del usuario
  fastify.get(
    "/my-rooms",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const rooms = await roomService.getUserRooms(request.user.userId);

        reply.send({
          success: true,
          data: { rooms },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          message: "Error interno del servidor",
        });
      }
    }
  );

  // Obtener información de una sala
  fastify.get(
    "/:roomId",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;

        // Verificar que el usuario es miembro de la sala
        const isMember = await roomService.isUserMember(
          roomId,
          request.user.userId
        );
        if (!isMember) {
          return reply.code(403).send({
            success: false,
            message: "No tienes acceso a esta sala",
          });
        }

        const room = await roomService.getRoomById(roomId);
        if (!room) {
          return reply.code(404).send({
            success: false,
            message: "Sala no encontrada",
          });
        }

        const members = await roomService.getRoomMembers(roomId);

        reply.send({
          success: true,
          data: {
            room,
            members,
          },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          message: "Error interno del servidor",
        });
      }
    }
  );

  // Obtener miembros de una sala
  fastify.get(
    "/:roomId/members",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;

        // Verificar que el usuario es miembro de la sala
        const isMember = await roomService.isUserMember(
          roomId,
          request.user.userId
        );
        if (!isMember) {
          return reply.code(403).send({
            success: false,
            message: "No tienes acceso a esta sala",
          });
        }

        const members = await roomService.getRoomMembers(roomId);

        reply.send({
          success: true,
          data: { members },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          message: "Error interno del servidor",
        });
      }
    }
  );

  // Unirse a una sala
  fastify.post(
    "/:roomId/join",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;

        await roomService.joinRoom(roomId, request.user.userId);

        reply.send({
          success: true,
          message: "Te has unido a la sala exitosamente",
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Salir de una sala
  fastify.post(
    "/:roomId/leave",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;

        const success = await roomService.leaveRoom(
          roomId,
          request.user.userId
        );

        if (success) {
          reply.send({
            success: true,
            message: "Has salido de la sala exitosamente",
          });
        } else {
          reply.code(400).send({
            success: false,
            message: "No se pudo salir de la sala",
          });
        }
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Actualizar sala
  fastify.put(
    "/:roomId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string", maxLength: 500 },
            isPrivate: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;
        const validatedData = updateRoomSchema.parse(request.body);

        const updatedRoom = await roomService.updateRoom(
          roomId,
          validatedData,
          request.user.userId
        );

        // Notificar a usuarios conectados de la sala sobre la actualización
        websocketManager.broadcastToRoom(roomId, {
          type: "room_updated",
          data: { room: updatedRoom },
        });

        reply.send({
          success: true,
          message: "Sala actualizada exitosamente",
          data: { room: updatedRoom },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Eliminar sala
  fastify.delete(
    "/:roomId",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;

        const success = await roomService.deleteRoom(
          roomId,
          request.user.userId
        );

        if (success) {
          // Notificar a usuarios conectados que la sala fue eliminada
          websocketManager.broadcastToRoom(roomId, {
            type: "room_deleted",
            data: { roomId },
          });

          reply.send({
            success: true,
            message: "Sala eliminada exitosamente",
          });
        } else {
          reply.code(400).send({
            success: false,
            message: "No se pudo eliminar la sala",
          });
        }
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
    "/:roomId/messages",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            before: { type: "string" },
            after: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;
        const { limit, before, after } = request.query;

        // Verificar que el usuario es miembro de la sala
        const isMember = await roomService.isUserMember(
          roomId,
          request.user.userId
        );
        if (!isMember) {
          return reply.code(403).send({
            success: false,
            message: "No tienes acceso a esta sala",
          });
        }

        const messages = await messageService.getRoomMessages(roomId, {
          limit: limit || 50,
          before,
          after,
        });

        reply.send({
          success: true,
          data: { messages },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          message: "Error interno del servidor",
        });
      }
    }
  );

  // Buscar mensajes en una sala
  fastify.get(
    "/:roomId/messages/search",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", minLength: 1 },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { roomId } = request.params;
        const { q: searchTerm, limit } = request.query;

        // Verificar que el usuario es miembro de la sala
        const isMember = await roomService.isUserMember(
          roomId,
          request.user.userId
        );
        if (!isMember) {
          return reply.code(403).send({
            success: false,
            message: "No tienes acceso a esta sala",
          });
        }

        const messages = await messageService.searchMessages(
          roomId,
          searchTerm,
          {
            limit: limit || 20,
          }
        );

        reply.send({
          success: true,
          data: { messages, searchTerm },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          message: "Error interno del servidor",
        });
      }
    }
  );
}
