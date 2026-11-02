export const limit = 16 * 1024;

export function decode(raw) {
  const event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  if (!event || typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(event.id) ||
      !['booking.created', 'crm.updated'].includes(event.type) ||
      !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
    throw new Error('invalid envelope');
  }
  return event;
}

export function decision(attempt, success, now) {
  if (success) return { state: 'delivered', due: 0 };
  if (attempt >= 3) return { state: 'dead', due: 0 };
  return { state: 'pending', due: now + 1000 * 2 ** (attempt - 1) };
}
