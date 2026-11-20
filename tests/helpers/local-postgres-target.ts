export function refusalReason(dsn: string): string | null {
  if (!dsn) return 'STRANDCUE_PG_DSN is not set';
  try {
    const url = new URL(dsn);
    // Numeric loopback avoids DNS and libpq query options cannot override it.
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.search || url.hash || !url.pathname || url.pathname === '/') return 'Only numeric loopback Postgres targets without URL options are allowed';
    return null;
  } catch { return 'Invalid Postgres URL'; }
}
