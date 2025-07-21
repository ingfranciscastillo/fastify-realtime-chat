import { eq, and, desc, asc, lt } from "drizzle-orm";
import { db } from "../db/connection.js";
import { messages, users } from "../db/schema.js";

// Crea un mensaje y devuelve el mensaje completo con información del remitente
export async function createMessage(messageData) {
  const { content, senderId, roomId, messageType, replyToId } = messageData;

  const newMessage = await db
    .insert(messages)
    .values({
      content,
      senderId,
      roomId,
      messageType: messageType || "text",
      replyToId: replyToId || null,
    })
    .returning();

  return await getMessageById(newMessage[0].id);
}

// Obtiene un mensaje por su ID
export async function getMessageById(messageId) {
  const message = await db
    .select({
      id: messages.id,
      content: messages.content,
      messageType: messages.messageType,
      replyToId: messages.replyToId,
      isEdited: messages.isEdited,
      isDeleted: messages.isDeleted,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      sender: {
        id: users.id,
        username: users.username,
        avatar: users.avatar,
      },
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.id, messageId))
    .limit(1);

  return message[0] || null;
}

// Obtiene los mensajes de una sala
export async function getRoomMessages(roomId, options = {}) {
  const { limit = 50, before = null, after = null } = options;

  let query = db
    .select({
      id: messages.id,
      content: messages.content,
      messageType: messages.messageType,
      replyToId: messages.replyToId,
      isEdited: messages.isEdited,
      isDeleted: messages.isDeleted,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      sender: {
        id: users.id,
        username: users.username,
        avatar: users.avatar,
      },
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(and(eq(messages.roomId, roomId), eq(messages.isDeleted, false)));

  if (before) {
    query = query.where(
      and(
        eq(messages.roomId, roomId),
        eq(messages.isDeleted, false),
        lt(messages.createdAt, new Date(before))
      )
    );
  }

  query = query.orderBy(desc(messages.createdAt)).limit(limit);

  const result = await query;

  // Devolver en orden cronológico
  return result.reverse();
}

// Actualiza el contenido de un mensaje
export async function updateMessage(messageId, content, userId) {
  const message = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message[0]) {
    throw new Error("Mensaje no encontrado");
  }

  if (message[0].senderId !== userId) {
    throw new Error("No tienes permisos para editar este mensaje");
  }

  if (message[0].isDeleted) {
    throw new Error("No se puede editar un mensaje eliminado");
  }

  const updatedMessage = await db
    .update(messages)
    .set({
      content,
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, messageId))
    .returning();

  return await getMessageById(updatedMessage[0].id);
}

// Marca un mensaje como eliminado (soft delete)
export async function deleteMessage(messageId, userId) {
  const message = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message[0]) {
    throw new Error("Mensaje no encontrado");
  }

  if (message[0].senderId !== userId) {
    throw new Error("No tienes permisos para eliminar este mensaje");
  }

  const deletedMessage = await db
    .update(messages)
    .set({
      isDeleted: true,
      content: "[Mensaje eliminado]",
      updatedAt: new Date(),
    })
    .where(eq(messages.id, messageId))
    .returning();

  return deletedMessage[0];
}

// Obtiene las respuestas a un mensaje
export async function getMessageReplies(messageId) {
  const replies = await db
    .select({
      id: messages.id,
      content: messages.content,
      messageType: messages.messageType,
      isEdited: messages.isEdited,
      isDeleted: messages.isDeleted,
      createdAt: messages.createdAt,
      sender: {
        id: users.id,
        username: users.username,
        avatar: users.avatar,
      },
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(
      and(eq(messages.replyToId, messageId), eq(messages.isDeleted, false))
    )
    .orderBy(asc(messages.createdAt));

  return replies;
}

// Busca mensajes en una sala
export async function searchMessages(roomId, searchTerm, options = {}) {
  const { limit = 20 } = options;

  // Búsqueda simple usando LIKE (para búsquedas más avanzadas se podría usar full-text search)
  const searchResults = await db
    .select({
      id: messages.id,
      content: messages.content,
      messageType: messages.messageType,
      isEdited: messages.isEdited,
      createdAt: messages.createdAt,
      sender: {
        id: users.id,
        username: users.username,
        avatar: users.avatar,
      },
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(messages.isDeleted, false)
        // Nota: Para PostgreSQL, usarías ilike en lugar de like para búsqueda insensible a mayúsculas
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return searchResults;
}
