declare global {
  interface Window {
    __MDK_DEBUG__?: boolean;
  }
}

type LogMeta = Record<string, unknown> | undefined;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED_KEYS = new Set([
  'content',
  'ciphertext',
  'privateKey',
  'private_key',
  'passphrase',
  'event',
  'filters',
  'raw',
]);

function isDevEnvironment(): boolean {
  return import.meta.env.DEV;
}

export function isRuntimeDebugEnabled(): boolean {
  if (!isDevEnvironment() || typeof window === 'undefined') {
    return false;
  }

  if (window.__MDK_DEBUG__ === true) {
    return true;
  }

  try {
    return window.localStorage.getItem('mdk-debug') === '1';
  } catch {
    return false;
  }
}

function sanitizeMeta(meta: LogMeta): LogMeta {
  if (!meta) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (value instanceof Error) {
      sanitized[key] = {
        name: value.name,
        message: value.message,
      };
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = value.length > 140 ? `${value.slice(0, 140)}...` : value;
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function write(level: LogLevel, scope: string, message: string, meta?: LogMeta): void {
  if (!isDevEnvironment()) {
    return;
  }

  const sanitizedMeta = sanitizeMeta(meta);
  const prefix = `[${scope}] ${message}`;

  if (level === 'debug' || level === 'info') {
    if (!isRuntimeDebugEnabled()) {
      return;
    }
    console.log(prefix, sanitizedMeta ?? '');
    return;
  }

  if (level === 'warn') {
    console.warn(prefix, sanitizedMeta ?? '');
    return;
  }

  console.error(prefix, sanitizedMeta ?? '');
}

export function debug(scope: string, message: string, meta?: LogMeta): void {
  write('debug', scope, message, meta);
}

export function info(scope: string, message: string, meta?: LogMeta): void {
  write('info', scope, message, meta);
}

export function warn(scope: string, message: string, meta?: LogMeta): void {
  write('warn', scope, message, meta);
}

export function error(scope: string, message: string, meta?: LogMeta): void {
  write('error', scope, message, meta);
}
