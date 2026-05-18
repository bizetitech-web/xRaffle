import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import {
  RealtimeEventContracts,
  createRealtimeEnvelope,
  realtimeRoomFor,
} from './realtime.events.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const REALTIME_TOKEN_TTL_SECONDS = Number(process.env.REALTIME_TOKEN_TTL_SECONDS || 3600);

const issueRealtimeToken = (user, { expiresInSeconds = REALTIME_TOKEN_TTL_SECONDS } = {}) => {
  if (!user?.sub) {
    throw new Error('Cannot issue realtime token without user subject');
  }

  return jwt.sign(
    {
      sub: user.sub,
      email: user.email,
      role: user.role,
      roleLevel: user.roleLevel,
      hotelCompanyId: user.hotelCompanyId,
      tokenType: 'realtime',
    },
    JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );
};

const normalizeToken = (value) => String(value || '').replace(/^Bearer\s+/i, '').trim();

const resolveTokenFromSocket = (socket) => {
  const authToken = socket?.handshake?.auth?.token;
  if (authToken) {
    return normalizeToken(authToken);
  }

  const headerAuth = socket?.handshake?.headers?.authorization;
  if (headerAuth) {
    return normalizeToken(headerAuth);
  }

  return '';
};

const decodeRealtimeToken = (token) => {
  if (!token) {
    throw new Error('Authentication required');
  }

  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.tokenType !== 'realtime') {
    throw new Error('Invalid realtime token');
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    roleLevel: decoded.roleLevel,
    hotelCompanyId: decoded.hotelCompanyId,
  };
};

const buildBaseRooms = (user) => {
  const rooms = [realtimeRoomFor.user(user.sub)];
  if (user.hotelCompanyId) {
    rooms.push(realtimeRoomFor.company(user.hotelCompanyId));
  }
  return rooms;
};

export class RealtimeGateway {
  constructor() {
    this.io = null;
  }

  attachServer(httpServer, options = {}) {
    if (this.io) {
      return this.io;
    }

    const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    this.io = new Server(httpServer, {
      cors: {
        origin: corsOrigins,
        credentials: true,
      },
      ...options,
    });

    this.io.use((socket, next) => {
      try {
        const token = resolveTokenFromSocket(socket);
        socket.user = decodeRealtimeToken(token);
        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
    });

    this.io.on('connection', (socket) => {
      for (const room of buildBaseRooms(socket.user)) {
        socket.join(room);
      }

      socket.emit(
        RealtimeEventContracts.system.connected,
        createRealtimeEnvelope(RealtimeEventContracts.system.connected, {
          socketId: socket.id,
          userId: socket.user.sub,
          hotelCompanyId: socket.user.hotelCompanyId,
        })
      );

      socket.on(RealtimeEventContracts.control.joinSession, (sessionId) => {
        if (!sessionId) {
          return;
        }
        socket.join(realtimeRoomFor.session(sessionId));
      });

      socket.on(RealtimeEventContracts.control.leaveSession, (sessionId) => {
        if (!sessionId) {
          return;
        }
        socket.leave(realtimeRoomFor.session(sessionId));
      });
    });

    return this.io;
  }

  getHealthSnapshot() {
    return {
      enabled: Boolean(this.io),
      transport: 'socket.io',
      connectedClients: this.io ? this.io.engine.clientsCount : 0,
      contracts: RealtimeEventContracts,
    };
  }

  emitSessionEvent({ event, payload = {}, sessionId, companyId }) {
    if (!this.io) {
      return false;
    }

    const envelope = createRealtimeEnvelope(event, payload, { sessionId, companyId });
    if (sessionId) {
      this.io.to(realtimeRoomFor.session(sessionId)).emit(event, envelope);
    }
    if (companyId) {
      this.io.to(realtimeRoomFor.company(companyId)).emit(event, envelope);
    }
    return true;
  }

  emitBoardEvent(payload) {
    return this.emitSessionEvent(payload);
  }

  emitDrawEvent(payload) {
    return this.emitSessionEvent(payload);
  }

  emitWinnerEvent(payload) {
    return this.emitSessionEvent(payload);
  }
}

export const createRealtimeGateway = () => new RealtimeGateway();
export const realtimeGateway = createRealtimeGateway();
export const realtimeGatewayTesting = {
  issueRealtimeToken,
  resolveTokenFromSocket,
  decodeRealtimeToken,
};
