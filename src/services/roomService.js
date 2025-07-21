import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/connection.js";
import { rooms, roomMembers, users } from "../db/schema.js";

// Crea una sala y agrega al creador como admin
export async function createRoom(roomData, creatorId) {
  const { name, description, isPrivate } = roomData;
  const newRoom = await db
    .insert(rooms)
    .values({
      name,
      description,
      isPrivate: isPrivate || false,
      createdBy: creatorId,
    })
    .returning();
  await db.insert(roomMembers).values({
    roomId: newRoom[0].id,
    userId: creatorId,
    role: "admin",
  });
  return newRoom[0];
}

// Obtiene las salas de un usuario
export async function getUserRooms(userId) {
  const userRooms = await db
    .select({
      room: {
        id: rooms.id,
        name: rooms.name,
        description: rooms.description,
        isPrivate: rooms.isPrivate,
        createdAt: rooms.createdAt,
      },
      membership: {
        role: roomMembers.role,
        joinedAt: roomMembers.joinedAt,
      },
    })
    .from(roomMembers)
    .leftJoin(rooms, eq(roomMembers.roomId, rooms.id))
    .where(eq(roomMembers.userId, userId))
    .orderBy(desc(roomMembers.joinedAt));
  return userRooms;
}

// Obtiene una sala por su ID
export async function getRoomById(roomId) {
  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  return room[0] || null;
}

// Obtiene los miembros de una sala
export async function getRoomMembers(roomId) {
  const members = await db
    .select({
      user: {
        id: users.id,
        username: users.username,
        avatar: users.avatar,
        isOnline: users.isOnline,
        lastSeen: users.lastSeen,
      },
      membership: {
        role: roomMembers.role,
        joinedAt: roomMembers.joinedAt,
      },
    })
    .from(roomMembers)
    .leftJoin(users, eq(roomMembers.userId, users.id))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(roomMembers.joinedAt);
  return members;
}

// Unirse a una sala
export async function joinRoom(roomId, userId) {
  const existingMember = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  if (existingMember.length > 0) {
    throw new Error("Ya eres miembro de esta sala");
  }
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error("Sala no encontrada");
  }
  const newMember = await db
    .insert(roomMembers)
    .values({
      roomId,
      userId,
      role: "member",
    })
    .returning();
  return newMember[0];
}

// Abandonar una sala
export async function leaveRoom(roomId, userId) {
  const room = await getRoomById(roomId);
  if (room && room.createdBy === userId) {
    throw new Error("El creador no puede abandonar la sala");
  }
  const result = await db
    .delete(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .returning();
  return result.length > 0;
}

// Verifica si un usuario es miembro de una sala
export async function isUserMember(roomId, userId) {
  const member = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return member.length > 0;
}

// Obtiene el rol de un usuario en una sala
export async function getUserRole(roomId, userId) {
  const member = await db
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return member[0]?.role || null;
}

// Actualiza una sala (solo admin)
export async function updateRoom(roomId, updates, userId) {
  const userRole = await getUserRole(roomId, userId);
  if (userRole !== "admin") {
    throw new Error("No tienes permisos para editar esta sala");
  }
  const allowedUpdates = {};
  if (updates.name) allowedUpdates.name = updates.name;
  if (updates.description !== undefined)
    allowedUpdates.description = updates.description;
  if (updates.isPrivate !== undefined)
    allowedUpdates.isPrivate = updates.isPrivate;
  allowedUpdates.updatedAt = new Date();
  const updatedRoom = await db
    .update(rooms)
    .set(allowedUpdates)
    .where(eq(rooms.id, roomId))
    .returning();
  return updatedRoom[0];
}

// Elimina una sala (solo el creador)
export async function deleteRoom(roomId, userId) {
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error("Sala no encontrada");
  }
  if (room.createdBy !== userId) {
    throw new Error("Solo el creador puede eliminar la sala");
  }
  await db.delete(rooms).where(eq(rooms.id, roomId));
  return true;
}
