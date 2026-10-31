// Ambient minimal contract for the optional `pg` driver used ONLY by
// protocol-execution-concurrency.pg.test.ts (env-gated, skipped by default).
// `pg` is intentionally NOT a repo dependency, so this declaration keeps
// typecheck green without adding one. The dynamic import inside that suite
// resolves at runtime only when an operator sets STRANDCUE_PG_DSN with `pg`
// resolvable in a scratch environment.
declare module 'pg' {
  export interface PgQueryResult<T = Record<string, unknown>> {
    rows: T[];
  }
  export class Client {
    constructor(config: { connectionString: string });
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<PgQueryResult<T>>;
  }
}
