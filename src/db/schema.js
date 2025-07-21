import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Tabla de usuarios
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    email: varchar("email", { length: 100 }).notNull().unique(),
    password: varchar("password", { length: 255 }).notNull(),
    avatar: varchar("avatar", { length: 255 }),
    isOnline: boolean("is_online").default(false),
    lastSeen: timestamp("last_seen"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    usernameIdx: index("username_idx").on(table.username),
    emailIdx: index("email_idx").on(table.email),
  })
);

// Tabla de salas de chat
export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isPrivate: boolean("is_private").default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    nameIdx: index("room_name_idx").on(table.name),
  })
);

// Tabla de miembros de salas
export const roomMembers = pgTable(
  "room_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow(),
    role: varchar("role", { length: 20 }).default("member"), // 'admin', 'moderator', 'member'
  },
  (table) => ({
    roomUserIdx: index("room_user_idx").on(table.roomId, table.userId),
  })
);

// Tabla de mensajes
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    senderId: uuid("sender_id").references(() => users.id),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    messageType: varchar("message_type", { length: 20 }).default("text"), // 'text', 'image', 'file'
    replyToId: uuid("reply_to_id").references(() => messages.id),
    isEdited: boolean("is_edited").default(false),
    isDeleted: boolean("is_deleted").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    roomCreatedIdx: index("room_created_idx").on(table.roomId, table.createdAt),
    senderIdx: index("sender_idx").on(table.senderId),
  })
);

// Relaciones
export const usersRelations = relations(users, ({ many }) => ({
  sentMessages: many(messages),
  roomMemberships: many(roomMembers),
  createdRooms: many(rooms),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  creator: one(users, {
    fields: [rooms.createdBy],
    references: [users.id],
  }),
  members: many(roomMembers),
  messages: many(messages),
}));

export const roomMembersRelations = relations(roomMembers, ({ one }) => ({
  room: one(rooms, {
    fields: [roomMembers.roomId],
    references: [rooms.id],
  }),
  user: one(users, {
    fields: [roomMembers.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  room: one(rooms, {
    fields: [messages.roomId],
    references: [rooms.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
  }),
  replies: many(messages),
}));
