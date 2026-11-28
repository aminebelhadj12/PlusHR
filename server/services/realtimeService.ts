import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken, JwtPayload } from '../middlewares/auth.js';
import { isTrustedBrowserOrigin } from '../middlewares/csrfProtection.js';
import { loadDb, mutateDb, newId } from '../repositories/dataStore.js';
import { isInMaintenance } from './maintenance.js';
import type { NotificationItem } from '../../src/types/index.js';

let io: SocketServer | null = null;
const onlineUsers = new Map<string, { userId: string; companyId: string | null; sockets: Set<string> }>();

export function initRealtimeServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    if (isInMaintenance()) return next(new Error('Maintenance'));
    try {
      const origin = socket.handshake.headers.origin;
      const forwardedProtocol = socket.handshake.headers['x-forwarded-proto'];
      const protocol = (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol)?.split(',')[0] ||
        (Reflect.get(socket.request.socket, 'encrypted') === true ? 'https' : 'http');
      const host = socket.handshake.headers.host;
      if (origin && (!host || !isTrustedBrowserOrigin(origin, `${protocol}://${host}`))) {
        return next(new Error('Origin not allowed'));
      }
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      if (!token) {
        return next(new Error('Unauthorized'));
      }
      const decoded = verifyAccessToken(token);
      const authenticatedSocket = socket as Socket & { user?: JwtPayload; accessToken?: string };
      authenticatedSocket.user = decoded;
      authenticatedSocket.accessToken = token;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as Socket & { user?: JwtPayload; accessToken?: string };
    const user = socket.user;
    if (!user || !socket.accessToken || isInMaintenance()) {
      socket.disconnect();
      return;
    }

    const expiresIn = (user.exp ?? 0) * 1000 - Date.now();
    const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, expiresIn));
    expiryTimer.unref();
    const sessionTimer = setInterval(() => {
      try {
        verifyAccessToken(socket.accessToken!);
      } catch {
        socket.disconnect(true);
      }
    }, 30_000);
    sessionTimer.unref();

    socket.join(`user:${user.userId}`);
    if (user.companyId) {
      socket.join(`company:${user.companyId}`);
    }
    socket.join(`session:${user.sessionId}`);
    socket.use((_packet, next) => {
      try {
        verifyAccessToken(socket.accessToken!);
        next();
      } catch {
        socket.disconnect(true);
        next(new Error('Unauthorized'));
      }
    });

    const existing = onlineUsers.get(user.userId) || {
      userId: user.userId,
      companyId: user.companyId,
      sockets: new Set<string>(),
    };
    existing.sockets.add(socket.id);
    onlineUsers.set(user.userId, existing);

    if (user.companyId) {
      io?.to(`company:${user.companyId}`).emit('presence:update', {
        onlineUserIds: getCompanyOnlineUserIds(user.companyId),
      });
    }

    socket.on('chat:typing', (payload: { conversationId: string; isTyping: boolean }) => {
      if (!user.companyId || !payload?.conversationId) return;
      const db = loadDb();
      const isMember = db.conversation_members.some(
        (m) => m.conversation_id === payload.conversationId && m.user_id === user.userId && m.company_id === user.companyId
      );
      if (!isMember) return;

      const members = db.conversation_members.filter((m) => m.conversation_id === payload.conversationId && m.user_id !== user.userId);
      for (const m of members) {
        io?.to(`user:${m.user_id}`).emit('chat:typing', {
          conversationId: payload.conversationId,
          userId: user.userId,
          isTyping: Boolean(payload.isTyping),
        });
      }
    });

    socket.on('disconnect', () => {
      clearTimeout(expiryTimer);
      clearInterval(sessionTimer);
      const entry = onlineUsers.get(user.userId);
      if (entry) {
        entry.sockets.delete(socket.id);
        if (entry.sockets.size === 0) {
          onlineUsers.delete(user.userId);
        }
      }
      if (user.companyId) {
        io?.to(`company:${user.companyId}`).emit('presence:update', {
          onlineUserIds: getCompanyOnlineUserIds(user.companyId),
        });
      }
    });
  });

  return io;
}

export function getRealtimeIo(): SocketServer | null {
  return io;
}

export function getCompanyOnlineUserIds(companyId: string): string[] {
  const ids: string[] = [];
  for (const [, val] of onlineUsers.entries()) {
    if (val.companyId === companyId && val.sockets.size > 0) {
      ids.push(val.userId);
    }
  }
  return ids;
}

export async function pushNotification(params: {
  company_id: string | null;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link_path?: string | null;
}): Promise<NotificationItem> {
  const item: NotificationItem = {
    id: newId('notif'),
    company_id: params.company_id,
    user_id: params.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    link_path: params.link_path ?? null,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  await mutateDb((db) => {
    db.notifications.unshift(item);
  });

  io?.to(`user:${params.user_id}`).emit('notification:new', item);
  return item;
}
