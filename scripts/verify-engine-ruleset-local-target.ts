import { URL } from 'node:url';

const NUMERIC_LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);

export function parseLocalApiTarget(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !NUMERIC_LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('Refusing a non-numeric-loopback API host');
  }
  if (url.port !== '55431' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Refusing an API target outside the dedicated local Supabase origin');
  }
  return url;
}

export function parseLocalDatabaseTarget(value: string): URL {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !NUMERIC_LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('Refusing a non-numeric-loopback database host');
  }
  if (url.port !== '55432' || url.pathname !== '/postgres' || !url.username || !url.password || url.search || url.hash) {
    throw new Error('Refusing a database target outside the dedicated local PostgreSQL origin');
  }
  return url;
}
