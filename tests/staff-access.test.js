import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/kathin-drinks.js';
import { createSessionToken } from '../lib/_auth.js';

test('staff changes take effect with the existing cookie and never grant admin authority',async()=>{
  const keys=['KATHIN_BRIDGE_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));const original=global.fetch;
  Object.assign(process.env,{KATHIN_BRIDGE_SECRET:'test-bridge-secret',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'});
  let staff=true,status='active',actorRole='member';const calls=[];
  global.fetch=async(url,options={})=>{
    calls.push({url,options});let rows=[];
    if(url.includes('kathin_drink_staff'))rows=staff?[{member_id:'actor'}]:[];
    else if(url.includes('/members?'))rows=[{id:'actor',role:actorRole,membership_status:status}];
    else if(url.includes('kathin_drink_event'))rows=[{is_open:true,starts_on:'2026-09-29',ends_on:'2026-11-08'}];
    return {ok:true,text:async()=>JSON.stringify(rows)};
  };
  const tokens=Object.fromEntries(['member','admin'].map(role=>[role,createSessionToken({memberId:'actor',role})]));
  const request=async(method,query={},body={},role='member')=>{
    const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await handler({method,query,body,headers:{cookie:'nathoeng_session='+tokens[role]}},res);return res;
  };
  try {
    const allowed=await request('GET',{view:'staff',queueOnly:'1'});assert.equal(allowed.statusCode,200);assert.equal(allowed.body.staff,true);assert.equal(allowed.body.admin,false);
    for(const action of ['assign-staff','remove-staff','menu-save','menu-image','open','close']){
      calls.length=0;assert.equal((await request('POST',{}, {action,memberId:'other'})).statusCode,403);
      assert.ok(!calls.some(call=>['POST','PATCH'].includes(call.options.method)));
    }
    staff=false;
    for(const [method,query,body] of [['GET',{view:'staff'},{}],['GET',{view:'lookup',q:'ทดสอบ'},{}],['POST',{}, {action:'grant',memberId:'other'}],['POST',{}, {action:'transition',orderId:1,status:'accepted'}]])
      assert.equal((await request(method,query,body)).statusCode,403);
    const member=await request('GET',{view:'member',queueOnly:'1'});assert.equal(member.statusCode,200);assert.equal(member.body.staff,false);
    assert.equal((await request('GET',{view:'staff'}, {},'admin')).statusCode,403,'stale admin cookie cannot override database role');
    actorRole='admin';assert.equal((await request('GET',{view:'staff'}, {},'admin')).statusCode,200);
    status='cancelled';assert.equal((await request('GET',{view:'staff'}, {},'admin')).statusCode,403);
  } finally {global.fetch=original;for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});
