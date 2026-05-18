export const RealtimeEventContracts = Object.freeze({
  system: Object.freeze({
    connected: 'realtime:connected',
  }),
  control: Object.freeze({
    joinSession: 'realtime:join-session',
    leaveSession: 'realtime:leave-session',
  }),
  session: Object.freeze({
    statusChanged: 'session:status-changed',
    reset: 'session:reset',
  }),
  board: Object.freeze({
    cardSold: 'board:card-sold',
    cardUnsold: 'board:card-unsold',
    bulkUpdated: 'board:bulk-updated',
    reset: 'board:reset',
  }),
  draw: Object.freeze({
    next: 'draw:next',
  }),
  winner: Object.freeze({
    claimed: 'winner:claimed',
  }),
});

export const realtimeRoomFor = Object.freeze({
  company: (companyId) => `company:${companyId}`,
  user: (userId) => `user:${userId}`,
  session: (sessionId) => `session:${sessionId}`,
});

export const createRealtimeEnvelope = (event, payload = {}, meta = {}) => ({
  event,
  payload,
  meta,
  timestamp: new Date().toISOString(),
});
