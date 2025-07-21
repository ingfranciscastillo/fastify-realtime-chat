import { z } from "zod";
import {
  authenticateUser,
  createUser,
  getUserById,
  updateUserOnlineStatus,
  updateUserProfile,
} from "../services/authService.js";

// Esquemas de validación
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  avatar: z.string().url().optional(),
});

export default async function authRoutes(fastify, options) {
  // Registro
  fastify.post(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["username", "email", "password"],
          properties: {
            username: { type: "string", minLength: 3, maxLength: 50 },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const validatedData = registerSchema.parse(request.body);
        const user = await createUser(validatedData);

        const token = fastify.jwt.sign({
          userId: user.id,
          username: user.username,
        });

        reply.code(201).send({
          success: true,
          message: "Usuario registrado exitosamente",
          data: {
            user,
            token,
          },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Login
  fastify.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const validatedData = loginSchema.parse(request.body);
        const user = await authenticateUser(
          validatedData.email,
          validatedData.password
        );

        const token = fastify.jwt.sign({
          userId: user.id,
          username: user.username,
        });

        reply.send({
          success: true,
          message: "Login exitoso",
          data: {
            user,
            token,
          },
        });
      } catch (error) {
        reply.code(401).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Obtener perfil del usuario actual
  fastify.get(
    "/profile",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const user = await getUserById(request.user.userId);

        if (!user) {
          return reply.code(404).send({
            success: false,
            message: "Usuario no encontrado",
          });
        }

        reply.send({
          success: true,
          data: { user },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          message: "Error interno del servidor",
        });
      }
    }
  );

  // Actualizar perfil
  fastify.put(
    "/profile",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string", minLength: 3, maxLength: 50 },
            avatar: { type: "string", format: "uri" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const validatedData = updateProfileSchema.parse(request.body);
        const updatedUser = await updateUserProfile(
          request.user.userId,
          validatedData
        );

        reply.send({
          success: true,
          message: "Perfil actualizado exitosamente",
          data: { user: updatedUser },
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // Logout (opcional - principalmente para limpiar estado)
  fastify.post(
    "/logout",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        // Actualizar estado offline
        await updateUserOnlineStatus(request.user.userId, false);

        reply.send({
          success: true,
          message: "Logout exitoso",
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          message: "Error interno del servidor",
        });
      }
    }
  );

  // Verificar token
  fastify.get(
    "/verify",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const user = await getUserById(request.user.userId);

        reply.send({
          success: true,
          data: {
            user,
            isValid: true,
          },
        });
      } catch (error) {
        reply.code(401).send({
          success: false,
          message: "Token inválido",
        });
      }
    }
  );
}
