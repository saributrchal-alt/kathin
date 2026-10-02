import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/kathin-drinks.js';
import { createSessionToken } from '../lib/_auth.js';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const order = () => ({ id: 12, member_id: 'customer', status: 'pending', service_day: today(), queue_number: '7001', right_id: 1 });
async function run({ method = 'POST', body = {}, query = {}, staff = true, current = order(), race = false, notification = 'sent' } = {}) {
  const keys = ['KATHIN_BRIDGE_SECRET', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = global.fetch;
  process.env.KATHIN_BRIDGE_SECRET = 'test-only-secret'; process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    let result = [];
    if (url.includes('route=kathin-queue-notify')) {
      if (notification === 'timeout') throw new Error('timeout');
      return { ok: true, json: async () => ({ status: notification }) };
    }
    if (url.includes('kathin_drink_staff')) result = staff ? [{ member_id: 'actor' }] : [];
    else if (url.includes('kathin_drink_event')) result = [{ is_open: true, starts_on: today(), ends_on: '2026-11-08' }];
    else if (url.includes('kathin_drink_orders')) {
      if (options.method === 'PATCH') result = race ? [] : [{ ...current, ...JSON.parse(options.body) }];
      else if (url.includes('status=in.')) result = [{ ...order(), status: 'accepted', accepted_at: new Date().toISOString() }];
      else result = current ? [current] : [];
    }
    else if (url.includes('/members?')) result = url.includes('id=eq.actor') ? [{id:'actor',role:'member',membership_status:'active'}] : [{ id: 'customer', full_name: 'สมาชิกทดสอบ' }];
    return { ok: true, text: async () => JSON.stringify(result) };
  };
  const res = { setHeader() {}, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
  try {
    await handler({ method, query, body, headers: { cookie: `nathoeng_session=${createSessionToken({ memberId: 'actor', role: 'member' })}` } }, res);
    return { res, calls };
  } finally { global.fetch = originalFetch; for (const k of keys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
}
test('only staff can call, recall, or hand over a drink', async () => {
  for (const body of [{ action: 'transition', status: 'accepted', orderId: 12 }, { action: 'recall', orderId: 12 }, { action: 'transition', status: 'sent', orderId: 12 }]) {
    const { res, calls } = await run({ staff: false, body }); assert.equal(res.statusCode, 403); assert.equal(calls.length, 2);
  }
});
test('a first call persists before the signed LINE relay and uses a conditional update', async () => {
  const { res, calls } = await run({ body: { action: 'transition', status: 'accepted', orderId: 12 } });
  assert.equal(res.statusCode, 200); assert.equal(res.body.order.status, 'accepted'); assert.equal(res.body.notification.status, 'sent');
  const patchIndex = calls.findIndex(c => c.options.method === 'PATCH');
  assert.match(calls[patchIndex].url, /status=eq.pending/); assert.match(calls[patchIndex].url, /event_key=eq.kathin-2569/);
  assert.equal(calls[patchIndex].options.headers.Prefer, 'return=representation'); assert.ok(patchIndex < calls.length - 1);
  const token = JSON.parse(calls.at(-1).options.body).token;
  const claim = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  assert.equal(claim.orderId, 12); assert.equal(claim.actorId, 'actor'); assert.equal(claim.aud, 'nathoeng-kathin-queue');
});
test('a lost concurrent update cannot send LINE or claim success', async () => {
  const { res, calls } = await run({ race: true, body: { action: 'transition', status: 'accepted', orderId: 12 } });
  assert.equal(res.statusCode, 409); assert.ok(!calls.some(c => c.url.includes('queue-notify')));
});
test('a pending drink cannot be handed over before being called', async () => {
  const { res, calls } = await run({ body: { action: 'transition', status: 'sent', orderId: 12 } });
  assert.equal(res.statusCode, 409); assert.ok(!calls.some(c => c.options.method === 'PATCH'));
});
test('handoff clears the ready state without another LINE message', async () => {
  const { res, calls } = await run({ current: { ...order(), status: 'accepted', accepted_at: new Date().toISOString() }, body: { action: 'transition', status: 'sent', orderId: 12 } });
  assert.equal(res.statusCode, 200); assert.equal(res.body.order.status, 'sent'); assert.ok(!calls.some(c => c.url.includes('queue-notify')));
});
test('recall creates a new audio timestamp while preserving rights and skipping LINE', async () => {
  const acceptedAt = new Date().toISOString();
  const { res, calls } = await run({ current: { ...order(), status: 'accepted', accepted_at: acceptedAt }, body: { action: 'recall', orderId: 12 } });
  assert.equal(res.statusCode, 200); assert.ok(Date.parse(res.body.order.accepted_at) > Date.parse(acceptedAt));
  const patch = calls.find(c => c.options.method === 'PATCH'); assert.deepEqual(Object.keys(JSON.parse(patch.options.body)), ['accepted_at']);
  assert.match(patch.url, /accepted_at=eq\./); assert.ok(!calls.some(c => /queue-notify|rights/.test(c.url)));
});
test('recall rejects collected and missing orders', async () => {
  for (const current of [{ ...order(), status: 'sent' }, null]) {
    const { res, calls } = await run({ current, body: { action: 'recall', orderId: 12 } }); assert.equal(res.statusCode, 409); assert.ok(!calls.some(c => c.options.method === 'PATCH'));
  }
});
test('unlinked LINE is silently skipped and a relay failure leaves the drink ready', async () => {
  const skipped = await run({ notification: 'skipped_unlinked', body: { action: 'transition', status: 'accepted', orderId: 12 } });
  assert.equal(skipped.res.statusCode, 200); assert.equal(skipped.res.body.warning, undefined);
  const failed = await run({ notification: 'timeout', body: { action: 'transition', status: 'accepted', orderId: 12 } });
  assert.equal(failed.res.statusCode, 200); assert.equal(failed.res.body.order.status, 'accepted'); assert.match(failed.res.body.warning, /LINE/);
});
test('member queue polling exposes only their orders and public call metadata', async () => {
  const { res, calls } = await run({ staff: false, method: 'GET', query: { view: 'member', queueOnly: '1' } });
  assert.equal(res.statusCode, 200);
  const own = calls.find(c => c.url.includes('select=*&order=')); assert.match(own.url, /member_id=eq.actor/);
  const publicCall = calls.find(c => c.url.includes('status=in.')); assert.match(publicCall.url, /order=accepted_at.desc,id.desc/);
  assert.deepEqual(Object.keys(res.body.currentCall).sort(), ['calledAt', 'orderId', 'queueNumber', 'status']);
  assert.ok(!calls.some(c => /menu|rights/.test(c.url))); assert.equal(res.body.viewerId, 'actor');
});
test('a member cannot poll the staff queue', async () => {
  const { res, calls } = await run({ staff: false, method: 'GET', query: { view: 'staff', queueOnly: '1' } }); assert.equal(res.statusCode, 403); assert.equal(calls.length, 2);
});
