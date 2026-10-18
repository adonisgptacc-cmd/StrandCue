import {describe, expect, it} from 'vitest';
import {refusalReason} from '../helpers/local-postgres-target';

describe('Postgres concurrency target boundary', () => {
  it.each(['postgres://u:p@example.test/db', 'postgres://u:p@127.0.0.1.evil.test/db',
    'postgres://u:p@localhost/db', 'postgres://u:p@project.supabase.co/db',
    'postgres://u:p@[::ffff:192.0.2.1]/db', 'https://127.0.0.1/db',
    'postgres://u:p@127.0.0.1/db?host=evil.test', 'postgres://u:p@127.0.0.1/db?service=hosted',
    'garbage', ''])('refuses %s', dsn => { expect(refusalReason(dsn)).not.toBeNull(); });
  it.each(['postgres://u:p@127.0.0.1:54322/postgres', 'postgresql://u:p@[::1]:54322/postgres'])('accepts numeric loopback %s', dsn => {
    expect(refusalReason(dsn)).toBeNull();
  });
});
