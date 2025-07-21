import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";

export const createUser = async (userData) => {
  const { username, email, password } = userData;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("El email ya está registrado");
  }

  const existingUsername = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existingUsername.length > 0) {
    throw new Error("El nombre de usuario ya está en uso");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await db
    .insert(users)
    .values({
      username,
      email,
      password: hashedPassword,
    })
    .returning({
      id: users.id,
      username: users.username,
      email: users.email,
      avatar: users.avatar,
      createdAt: users.createdAt,
    });

  return newUser[0];
};

export const authenticateUser = async (email, password) => {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user.length === 0) {
    throw new Error("Credenciales inválidas");
  }

  const isPasswordValid = await bcrypt.compare(password, user[0].password);

  if (!isPasswordValid) {
    throw new Error("Credenciales inválidas");
  }

  await db
    .update(users)
    .set({
      isOnline: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user[0].id));

  return {
    id: user[0].id,
    username: user[0].username,
    email: user[0].email,
    avatar: user[0].avatar,
  };
};

export const getUserById = async (userId) => {
  const user = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      avatar: users.avatar,
      isOnline: users.isOnline,
      lastSeen: users.lastSeen,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user[0] || null;
};

export const updateUserOnlineStatus = async (userId, isOnline) => {
  return await db
    .update(users)
    .set({
      isOnline,
      lastSeen: isOnline ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
};

export const updateUserProfile = async (userId, updates) => {
  const allowedUpdates = {};
  if (updates.username) allowedUpdates.username = updates.username;
  if (updates.avatar) allowedUpdates.avatar = updates.avatar;

  allowedUpdates.updatedAt = new Date();

  const updatedUser = await db
    .update(users)
    .set(allowedUpdates)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      username: users.username,
      email: users.email,
      avatar: users.avatar,
    });

  return updatedUser[0];
};
