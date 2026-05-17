export function toLocalDateInputValue(date) {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

export function defaultRange(days = 7, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(end.getDate() - (days - 1));

  return {
    from: toLocalDateInputValue(start),
    to: toLocalDateInputValue(end),
  };
}
