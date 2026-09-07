import pool from '../../../config/database.js';

export const registerAfterCommit = (connection, hook) => {
  if (!connection || typeof hook !== 'function') {
    return;
  }

  if (!Array.isArray(connection.__afterCommitHooks)) {
    connection.__afterCommitHooks = [];
  }

  connection.__afterCommitHooks.push(hook);
};

export const withTransaction = async (work) => {
  const connection = await pool.getConnection();

  try {
    connection.__afterCommitHooks = [];
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();

    for (const hook of connection.__afterCommitHooks) {
      try {
        await hook();
      } catch (error) {
        console.error('[withTransaction] afterCommit hook failed', error?.message || error);
      }
    }

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    delete connection.__afterCommitHooks;
    connection.release();
  }
};
