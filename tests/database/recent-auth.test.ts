import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, database, USER_A } from './harness.ts';

describe('verified password authentication freshness',()=>{
  let db:PGlite;
  beforeAll(async()=>{db=await database();await asUser(db,USER_A);},60_000);
  afterAll(async()=>{await db?.close();});
  async function check(amr:unknown,window:unknown=15) {
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:USER_A,amr})]);
    return (await db.query<{allowed:boolean}>('select strandcue_private.recent_auth($1) allowed',[window])).rows[0].allowed;
  }
  it('accepts real Auth Unix-second password timestamps',async()=>{
    expect(await check([{method:'password',timestamp:Math.floor(Date.now()/1000)}])).toBe(true);
  });
  it('rejects stale, future and malformed password timestamps',async()=>{
    const now=Math.floor(Date.now()/1000);
    for(const timestamp of [now-901,now+60,new Date().toISOString(),new Date((now+60)*1000).toISOString(),'bad',null,{},now*1000]) {
      expect(await check([{method:'password',timestamp}])).toBe(false);
    }
  });
  it('rejects other methods even with a fresh timestamp',async()=>{
    for(const method of ['token_refresh','recovery','anonymous','unknown','totp',null]) {
      expect(await check([{method,timestamp:Math.floor(Date.now()/1000)}])).toBe(false);
    }
  });
  it('does not let refreshed claims renew a stale password authentication',async()=>{
    const now=Math.floor(Date.now()/1000);
    expect(await check([{method:'password',timestamp:now-901},{method:'token_refresh',timestamp:now}])).toBe(false);
  });
  it('rejects missing claims and invalid windows',async()=>{
    expect(await check(null)).toBe(false);
    expect(await check([null,{},'password'])).toBe(false);
    for(const window of [null,0,-1,16]) {
      expect(await check([{method:'password',timestamp:Math.floor(Date.now()/1000)}],window)).toBe(false);
    }
  });
});
