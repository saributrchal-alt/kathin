import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/kathin-drinks.js';
import { createSessionToken } from '../lib/_auth.js';

const envKeys = ['KATHIN_BRIDGE_SECRET', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'];
async function run(role, action, body = {}) {
  const saved = Object.fromEntries(envKeys.map(k => [k, process.env[k]])); const savedFetch = global.fetch;
  process.env.KATHIN_BRIDGE_SECRET = 'test-only-secret'; process.env.SUPABASE_URL = 'https://example.supabase.co/rest/v1/'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, text: async () => url.includes('kathin_drink_staff') ? '[{"member_id":"actor"}]' : '[{"id":"drip-existing"}]' }; };
  const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  try { await handler({ method: 'POST', headers: { cookie: `nathoeng_session=${createSessionToken({ memberId: 'actor', role })}` }, body: { action, ...body } }, res); return { res, calls }; }
  finally { global.fetch = savedFetch; for (const k of envKeys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
}
const menu = { name_th: 'กาแฟทดสอบ', name_en: 'Test', category: 'drip', description: 'รายละเอียด', active: true, sort_order: 10, image_url: '' };
test('staff cannot edit menus or upload images', async () => {
  for (const action of ['menu-save', 'menu-image']) { const { res, calls } = await run('member', action, menu); assert.equal(res.statusCode, 403); assert.equal(calls.length, 1); }
});
test('admin creates an orderable menu with a server generated id', async () => {
  const { res, calls } = await run('admin', 'menu-save', menu); assert.equal(res.statusCode, 200); const last = calls.at(-1); const body = JSON.parse(last.options.body); assert.match(body.id, /^drip-/); assert.equal(body.description, 'รายละเอียด'); assert.equal(last.url, 'https://example.supabase.co/rest/v1/kathin_drink_menu');
});
test('admin edits existing menu without changing its id', async () => {
  const { res, calls } = await run('admin', 'menu-save', { ...menu, menuId: 'drip-existing', category: 'blended' }); assert.equal(res.statusCode, 200); assert.equal(calls.at(-1).options.method, 'PATCH'); assert.equal(JSON.parse(calls.at(-1).options.body).id, undefined);
});
test('menu images must belong to approved media storage', async () => {
  const { res, calls } = await run('admin', 'menu-save', { ...menu, image_url: 'https://example.com/image.jpg' }); assert.equal(res.statusCode, 400); assert.equal(calls.length, 1);
});
