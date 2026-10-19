const RESERVED = new Set(['time', 'level', 'message', 'pid', 'file', 'service']);

function pad(value, size = 2) {
  return String(value).padStart(size, '0');
}

function formatTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
  ].join('');
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string') {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatMeta(entry) {
  const parts = [];

  for (const [key, value] of Object.entries(entry)) {
    if (RESERVED.has(key)) {
      continue;
    }
    parts.push(`${key}=${formatValue(value)}`);
  }

  return parts.join(' ');
}

export function formatEntry(entry) {
  const timestamp = formatTimestamp(entry.time);
  const level = String(entry.level ?? 'info').toUpperCase();
  const pid = entry.pid ?? process.pid;
  const file = entry.file ?? entry.component ?? 'app';
  const message = entry.message ?? '';
  const meta = formatMeta(entry);

  return `${timestamp}|${level}|${pid}|${file}|${message}${meta ? ` | ${meta}` : ''}`;
}
