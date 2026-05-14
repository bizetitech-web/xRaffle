function serializeError(err) {
  if (!err) {
    return undefined;
  }

  return {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: err.stack,
  };
}

function baseEntry(level, message, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
}

export function logInfo(message, meta = {}) {
  console.log(JSON.stringify(baseEntry('info', message, meta)));
}

export function logWarn(message, meta = {}) {
  console.warn(JSON.stringify(baseEntry('warn', message, meta)));
}

export function logError(message, meta = {}) {
  const entry = baseEntry('error', message, {
    ...meta,
    error: serializeError(meta.error),
  });

  console.error(JSON.stringify(entry));
}
