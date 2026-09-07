export async function writeAuditLog(connection, {
  companyId = null,
  userId = null,
  action,
  tableName,
  recordId = null,
  entityType = null,
  details = null,
}) {
  if (!connection || typeof connection.query !== 'function' || !action || !tableName) {
    return;
  }

  try {
    const resolvedGameId = (() => {
      if (details && typeof details === 'object' && typeof details.gameId === 'string') {
        return details.gameId;
      }
      if (tableName === 'games' && typeof recordId === 'string') {
        return recordId;
      }
      return null;
    })();

    await connection.query(
      `INSERT INTO audit_logs
        (id, hotel_company_id, user_id, action, table_name, entity_type, record_id, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`,
      [
        companyId,
        userId,
        action,
        tableName,
        entityType,
        recordId,
      ]
    );

    if (details && typeof details === 'object') {
      // Persist richer detail to game_audit_logs where available without changing current audit_logs schema.
      await connection.query(
        `INSERT INTO game_audit_logs (id, game_id, actor, action, details, created_at)
         VALUES (UUID(), ?, ?, ?, ?, NOW())`,
        [
          resolvedGameId,
          userId,
          action,
          JSON.stringify(details),
        ]
      );
    }
  } catch (error) {
    // Keep core business flows resilient if audit write fails.
    console.error('[audit-log] write failed', error?.message || error);
  }
}
