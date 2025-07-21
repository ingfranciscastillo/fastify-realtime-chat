import * as authService from "./authService.js";

// Estado global para los clientes y salas
const clients = new Map(); // userId -> { socket, rooms: Set(), user }
const rooms = new Map(); // roomId -> Set of userIds

// Maneja la conexión de un nuevo socket
export async function handleConnection(socket, request) {
  try {
    const token = extractToken(request);
    if (!token) {
      socket.close(1008, "Token requerido");
      return;
    }
    const payload = verifyToken(token);
    const userId = payload.userId;
    const user = await authService.getUserById(userId);
    if (!user) {
      socket.close(1008, "Usuario no válido");
      return;
    }
    clients.set(userId, {
      socket,
      rooms: new Set(),
      user: user,
    });
    await authService.updateUserOnlineStatus(userId, true);
    setupSocketEvents(socket, userId);
    sendToClient(userId, {
      type: "connected",
      data: { user },
    });
    console.log(`Usuario ${user.username} conectado`);
  } catch (error) {
    console.error("Error en conexión WebSocket:", error);
    socket.close(1008, "Error de autenticación");
  }
}

export function setupSocketEvents(socket, userId) {
  socket.on("message", async (data) => {
    try {
      const message = JSON.parse(data);
      await handleMessage(userId, message);
    } catch (error) {
      console.error("Error procesando mensaje:", error);
      sendToClient(userId, {
        type: "error",
        data: { message: "Error procesando mensaje" },
      });
    }
  });
  socket.on("close", async () => {
    await handleDisconnection(userId);
  });
  socket.on("error", (error) => {
    console.error(`Error en socket de usuario ${userId}:`, error);
  });
}

export async function handleMessage(userId, message) {
  const { type, data } = message;
  switch (type) {
    case "join_room":
      await handleJoinRoom(userId, data.roomId);
      break;
    case "leave_room":
      await handleLeaveRoom(userId, data.roomId);
      break;
    case "send_message":
      await handleSendMessage(userId, data);
      break;
    case "typing_start":
      handleTyping(userId, data.roomId, true);
      break;
    case "typing_stop":
      handleTyping(userId, data.roomId, false);
      break;
    case "ping":
      sendToClient(userId, { type: "pong" });
      break;
    default:
      console.log(`Tipo de mensaje no reconocido: ${type}`);
  }
}

export async function handleJoinRoom(userId, roomId) {
  const client = clients.get(userId);
  if (!client) return;
  try {
    const roomService = (await import("./roomService.js")).default;
    const isMember = await roomService.isUserMember(roomId, userId);
    if (!isMember) {
      sendToClient(userId, {
        type: "error",
        data: { message: "No eres miembro de esta sala" },
      });
      return;
    }
    client.rooms.add(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(userId);
    broadcastToRoom(
      roomId,
      {
        type: "user_joined",
        data: {
          user: client.user,
          roomId,
        },
      },
      userId
    );
    sendToClient(userId, {
      type: "room_joined",
      data: { roomId },
    });
    console.log(`Usuario ${client.user.username} se unió a sala ${roomId}`);
  } catch (error) {
    console.error("Error al unirse a sala:", error);
    sendToClient(userId, {
      type: "error",
      data: { message: "Error al unirse a la sala" },
    });
  }
}

export async function handleLeaveRoom(userId, roomId) {
  const client = clients.get(userId);
  if (!client) return;
  client.rooms.delete(roomId);
  if (rooms.has(roomId)) {
    rooms.get(roomId).delete(userId);
    if (rooms.get(roomId).size === 0) {
      rooms.delete(roomId);
    } else {
      broadcastToRoom(roomId, {
        type: "user_left",
        data: {
          user: client.user,
          roomId,
        },
      });
    }
  }
  sendToClient(userId, {
    type: "room_left",
    data: { roomId },
  });
  console.log(`Usuario ${client.user.username} salió de sala ${roomId}`);
}

export async function handleSendMessage(userId, messageData) {
  try {
    const { roomId, content, messageType, replyToId } = messageData;
    const client = clients.get(userId);
    if (!client || !client.rooms.has(roomId)) {
      sendToClient(userId, {
        type: "error",
        data: { message: "No estás en esta sala" },
      });
      return;
    }
    const messageService = (await import("./messageService.js")).default;
    const newMessage = await messageService.createMessage({
      content,
      senderId: userId,
      roomId,
      messageType: messageType || "text",
      replyToId,
    });
    broadcastToRoom(roomId, {
      type: "new_message",
      data: {
        message: newMessage,
        roomId,
      },
    });
    console.log(`Nuevo mensaje en sala ${roomId} de ${client.user.username}`);
  } catch (error) {
    console.error("Error enviando mensaje:", error);
    sendToClient(userId, {
      type: "error",
      data: { message: "Error enviando mensaje" },
    });
  }
}

export function handleTyping(userId, roomId, isTyping) {
  const client = clients.get(userId);
  if (!client || !client.rooms.has(roomId)) return;
  broadcastToRoom(
    roomId,
    {
      type: isTyping ? "user_typing" : "user_stopped_typing",
      data: {
        user: client.user,
        roomId,
      },
    },
    userId
  );
}

export async function handleDisconnection(userId) {
  const client = clients.get(userId);
  if (!client) return;
  try {
    await authService.updateUserOnlineStatus(userId, false);
    for (const roomId of client.rooms) {
      broadcastToRoom(roomId, {
        type: "user_left",
        data: {
          user: client.user,
          roomId,
        },
      });
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(userId);
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        }
      }
    }
    clients.delete(userId);
    console.log(`Usuario ${client.user.username} desconectado`);
  } catch (error) {
    console.error("Error en desconexión:", error);
  }
}

// Métodos utilitarios
export function sendToClient(userId, message) {
  const client = clients.get(userId);
  if (client && client.socket.readyState === 1) {
    try {
      client.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("Error enviando mensaje a cliente:", error);
    }
  }
}

export function broadcastToRoom(roomId, message, excludeUserId = null) {
  const roomUsers = rooms.get(roomId);
  if (!roomUsers) return;
  for (const userId of roomUsers) {
    if (userId !== excludeUserId) {
      sendToClient(userId, message);
    }
  }
}

export function broadcastToAllClients(message, excludeUserId = null) {
  for (const userId of clients.keys()) {
    if (userId !== excludeUserId) {
      sendToClient(userId, message);
    }
  }
}

export function extractToken(request) {
  const url = new URL(request.url, "ws://localhost");
  const token = url.searchParams.get("token");
  if (token) return token;
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

export function verifyToken(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString()
    );
    return payload;
  } catch (error) {
    throw new Error("Token inválido");
  }
}

export function getRoomUsers(roomId) {
  const roomUsers = rooms.get(roomId);
  if (!roomUsers) return [];
  return Array.from(roomUsers)
    .map((userId) => {
      const client = clients.get(userId);
      return client ? client.user : null;
    })
    .filter(Boolean);
}

export function getOnlineUsers() {
  return Array.from(clients.values()).map((client) => client.user);
}

export function isUserOnline(userId) {
  return clients.has(userId);
}

export function getUserRooms(userId) {
  const client = clients.get(userId);
  return client ? Array.from(client.rooms) : [];
}
