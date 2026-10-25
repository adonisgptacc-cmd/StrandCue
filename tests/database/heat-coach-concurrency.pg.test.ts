// Opt-in proof against disposable numeric-loopback PostgreSQL only. Never target hosted or production.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refusalReason } from '../helpers/local-postgres-target.ts';

type PgClient = import('pg').Client;
type PgConstructor = new (config: { connectionString: string }) => PgClient;
const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
const suite = refusal === null ? describe : describe.skip;
if (refusal) console.warn(`[heat-coach-concurrency.pg] SKIP/BLOCKED - real-Postgres proof not run: ${refusal}`);

suite(refusal === null ? 'real-Postgres Heat Coach two-session convergence' : `real-Postgres Heat Coach (SKIPPED/BLOCKED: ${refusal})`, () => {
  let Client: PgConstructor;
  let admin: PgClient;
  const owner = crypto.randomUUID();
  const publication = crypto.randomUUID();
  let digest = `sha256:${'c'.repeat(64)}`;
  const intent = JSON.stringify({ method:{state:'unknown'},temperature:{state:'unknown'},setting:{state:'unknown'},passes:{state:'unknown'},durationMinutes:{state:'unknown'},zones:[] });

  const client = async () => { const value = new Client({ connectionString: dsn }); await value.connect(); await value.query("set statement_timeout='20000'"); return value; };
  const asOwner = async (value: PgClient) => {
    await value.query('reset role');
    await value.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [owner, JSON.stringify({sub:owner,role:'authenticated',email:'heat-proof@example.test',is_anonymous:false})]);
    await value.query('set role authenticated');
  };
  const call = (value: PgClient, operation: string, body = intent) => value.query<{result:any}>(
    'select public.create_heat_coach_assessment($1::uuid,$2::uuid,$3,$4::jsonb) result',[operation,publication,digest,body]);

  beforeAll(async () => {
    // eslint-disable-next-line import/no-unresolved -- optional scratch driver for opt-in local proof
    ({ Client } = await import('pg'));
    admin = await client();
    expect((await admin.query("select to_regprocedure('public.create_heat_coach_assessment(uuid,uuid,text,jsonb)') signature")).rows[0].signature).toBeTruthy();
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[owner]);
    await asOwner(admin); await admin.query('select public.complete_account($1,true)',['heat_pg_proof']);
    await admin.query('reset role');
    const rule={schemaVersion:1,publicationId:publication,ruleVersion:'1.0.0',digest:digest.slice(7),lifecycle:'reviewed',validFrom:'2026-01-01T00:00:00.000Z',validUntil:null,requiredProductCapability:null,allowedMethods:['heated-air'],limits:{temperatures:[],namedSettings:[],maximumPasses:null,maximumDurationMinutes:null},necessityRules:[],hardRestrictions:[],alternatives:[],reasonCode:'reviewed_limit',copyKey:'heat.reviewed_limit'};
    const inserted=await admin.query<{content_digest:string}>(`with source as (select $2::jsonb - 'digest' rule), bound as (select rule,encode(sha256(convert_to(rule::text,'UTF8')),'hex') digest from source)
      insert into strandcue_private.heat_rule_publications(id,content_digest,rule,state,authored_by,reviewed_by,reviewed_at,published_at)
      select $1,'sha256:'||digest,rule||jsonb_build_object('digest',digest),'published','proof author','proof reviewer',now(),now() from bound returning content_digest`,[publication,JSON.stringify(rule)]);
    digest=inserted.rows[0]!.content_digest;
  },60_000);

  afterAll(async () => { if (!admin) return; await admin.query('reset role'); await admin.query('delete from auth.users where id=$1',[owner]); await admin.query('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard'); await admin.query('delete from strandcue_private.heat_rule_publications where id=$1',[publication]); await admin.query('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard'); await admin.end(); });

  it('converges identical retries and same-intent creates, while changed replay conflicts', async () => {
    const a=await client(); const b=await client(); await asOwner(a); await asOwner(b);
    const operation=crypto.randomUUID();
    const [first,second]=await Promise.all([call(a,operation),call(b,operation)]);
    expect(second.rows[0].result).toEqual(first.rows[0].result);
    const third=await call(b,crypto.randomUUID());
    expect(third.rows[0].result.assessmentId).toBe(first.rows[0].result.assessmentId);
    const changed=JSON.stringify({...JSON.parse(intent),zones:[{region:'whole_head',segment:'entire_strand'}]});
    await expect(call(b,operation,changed)).rejects.toThrow(/operation-conflict/);
    await a.end(); await b.end();
    const count=await admin.query(`select count(*)::int count from public.heat_coach_assessments where owner=$1`,[owner]);
    expect(count.rows[0].count).toBe(1);
  },60_000);
});
