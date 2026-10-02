import crypto from 'crypto';
import { uploadPublicImage } from '../lib/_media-upload.js';
import { createSessionToken, getSessionFromRequest, setSessionCookie } from '../lib/_auth.js';
import { notifyQueueCall } from '../lib/_queue-notify.js';

const EVENT = 'kathin-2569';
const headers = (key, extra = {}) => ({
  apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), Accept: 'application/json',
  'Content-Type': 'application/json', ...extra
});
async function read(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}
function send(res, status, body) { res.status(status).json(body); }
function url(base, table, query = '') {
  const origin = String(base).trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  return `${origin}/rest/v1/${table}${query ? `?${query}` : ''}`;
}
async function rest(base, key, table, query, options = {}) {
  const response = await fetch(url(base, table, query), {
    ...options, headers: headers(key, options.headers), cache: 'no-store'
  });
  const data = await read(response);
  if (!response.ok) {
    const error = new Error(typeof data === 'object' ? data?.message || data?.hint || 'Database request failed' : String(data));
    error.dbStatus = response.status;
    error.dbCode = typeof data?.code === 'string' ? data.code.slice(0, 20) : '';
    throw error;
  }
  return data;
}
async function lookup(base, key, table, query) { return rest(base, key, table, query); }
function isAdmin(session) { return session?.role === 'admin'; }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return send(res, 405, { success: false, message: 'Method not allowed' });
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return send(res, 500, { success: false, message: 'ระบบฐานข้อมูลยังตั้งค่าไม่ครบ' });
  if (req.method === 'POST' && req.body?.action === 'session-exchange') {
    const token = String(req.body?.token || '');
    const secret = process.env.KATHIN_BRIDGE_SECRET;
    if (!secret || token.length > 4000) return send(res, 401, { success: false, message: 'ไม่สามารถยืนยันบัญชีสมาชิกได้' });
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return send(res, 401, { success: false, message: 'โทเคนไม่ถูกต้อง' });
    const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
    const received = Buffer.from(parts[1]);
    const signed = Buffer.from(expected);
    if (received.length !== signed.length || !crypto.timingSafeEqual(received, signed)) return send(res, 401, { success: false, message: 'โทเคนไม่ถูกต้อง' });
    try {
      const claim = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (claim.aud !== 'nathoeng-kathin' || !claim.sub || !Number.isFinite(claim.exp) || claim.exp <= Date.now() || claim.exp - Date.now() > 300000) return send(res, 401, { success: false, message: 'โทเคนหมดอายุหรือไม่ถูกต้อง' });
      const people = await lookup(base, key, 'members', `id=eq.${encodeURIComponent(claim.sub)}&select=id,role,membership_status&limit=1`);
      const member = people?.[0];
      if (!member || (member.membership_status && member.membership_status !== 'active')) return send(res, 403, { success: false, message: 'สมาชิกไม่พร้อมใช้งาน' });
      setSessionCookie(res, createSessionToken({ memberId: member.id, role: member.role || 'member' }), 12 * 3600);
      return send(res, 200, { success: true });
    } catch (error) {
      console.error('Kathin session exchange:', error);
      const detail = error.dbStatus
        ? `ฐานข้อมูลตอบ HTTP ${error.dbStatus}${error.dbCode ? ` (${error.dbCode})` : ''}`
        : 'ติดต่อฐานข้อมูลไม่ได้';
      return send(res, 503, { success: false, message: `เชื่อมบัญชีสมาชิกไม่สำเร็จ: ${detail}` });
    }
  }
  const session = getSessionFromRequest(req);
  if (!session?.memberId) return send(res, 401, { success: false, message: 'กรุณาเข้าสู่ระบบสมาชิก' });
  const actorId = String(session.memberId);
  try {
    const staffRows = await lookup(base, key, 'kathin_drink_staff', `member_id=eq.${encodeURIComponent(actorId)}&active=eq.true&select=member_id`);
    const staff = Array.isArray(staffRows) && staffRows.length > 0;
    const admin = isAdmin(session);
    const canServe = staff || admin;

    if (req.method === 'GET') {
      const action = String(req.query?.view || 'member');
      if (action === 'lookup') {
        if (!canServe) return send(res, 403, { success: false, message: 'ต้องได้รับสิทธิ์ Staff งานกฐินก่อน' });
        const term = String(req.query?.q || '').trim().slice(0, 80);
        if (term.length < 2) return send(res, 200, { success: true, members: [] });
        const pattern = encodeURIComponent(`*${term.replace(/[,*()]/g, ' ')}*`);
        const matches = await lookup(base, key, 'members', `or=(full_name.ilike.${pattern},display_name.ilike.${pattern})&select=id,full_name,display_name&limit=12`);
        return send(res, 200, { success: true, members: (matches || []).map((m) => ({ id: m.id, name: m.full_name || m.display_name || 'สมาชิก' })) });
      }
      if (action === 'staff' && !canServe) return send(res, 403, { success: false, message: 'ต้องได้รับสิทธิ์ Staff งานกฐินก่อน' });
      const queueOnly = req.query?.queueOnly === '1';
      const [eventRows, menu] = queueOnly ? [[], []] : await Promise.all([
        lookup(base, key, 'kathin_drink_event', `event_key=eq.${EVENT}&select=event_key,is_open,starts_on,ends_on`),
        lookup(base, key, 'kathin_drink_menu', 'select=*&order=sort_order.asc,id.asc')
      ]);
      const event = eventRows?.[0] || { event_key: EVENT, is_open: false };
      const bangkokToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
      if (bangkokToday > String(event.ends_on || '2026-11-08')) event.is_open = false;
      const today = bangkokToday;
      const [rights, orders, called] = await Promise.all([
        queueOnly ? [] : lookup(base, key, 'kathin_drink_rights', `event_key=eq.${EVENT}&member_id=eq.${encodeURIComponent(actorId)}&select=id,source,created_at&order=id.asc`),
        lookup(base, key, 'kathin_drink_orders', `event_key=eq.${EVENT}&${action === 'staff' ? '' : `member_id=eq.${encodeURIComponent(actorId)}&`}select=*&order=service_day.asc,queue_seq.asc`),
        lookup(base, key, 'kathin_drink_orders', `event_key=eq.${EVENT}&service_day=eq.${today}&status=in.(accepted,sent)&accepted_at=not.is.null&select=id,queue_number,accepted_at,status&order=accepted_at.desc,id.desc&limit=1`)
      ]);
      const memberOrders = (orders || []).filter((o) => o.member_id === actorId);
      const usedRights = new Set(memberOrders.filter((o) => o.status !== 'cancelled').map((o) => String(o.right_id)));
      const data = { event, menu: (menu || []).filter((item) => item.active || admin), rights: rights || [], availableRights: (rights || []).filter((r) => !usedRights.has(String(r.id))).length,
        orders: orders || [], currentQueue: called?.[0]?.queue_number || null,
        currentCall: called?.[0] ? { orderId: called[0].id, queueNumber: called[0].queue_number, calledAt: called[0].accepted_at, status: called[0].status } : null,
        serviceDay: today, viewerId: actorId, staff, admin };
      if (action === 'staff') {
        const memberIds = [...new Set((orders || []).map((o) => o.member_id).filter(Boolean))];
        if (memberIds.length) {
          const filter = `(${memberIds.map((id) => `"${String(id).replaceAll('"', '')}"`).join(',')})`;
          const people = await lookup(base, key, 'members', `id=in.${encodeURIComponent(filter)}&select=id,full_name,display_name`);
          const names = new Map((people || []).map((p) => [String(p.id), p.full_name || p.display_name || 'สมาชิก']));
          data.orders = data.orders.map((o) => ({ ...o, member_name: names.get(String(o.member_id)) || 'สมาชิก' }));
        }
      }
      if (queueOnly) return send(res, 200, { success: true, orders: data.orders, currentQueue: data.currentQueue,
        currentCall: data.currentCall, serviceDay: today, viewerId: actorId });
      return send(res, 200, { success: true, ...data });
    }

    const body = req.body || {};
    const action = String(body.action || '');
    if (action === 'menu-image') {
      if (!admin) return send(res, 403, { success: false, message: 'เฉพาะ Admin จัดการรูปเมนูได้' });
      const raw = String(body.image || '');
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
      if (!match || raw.length > 2900000) return send(res, 400, { success: false, message: 'กรุณาเลือกรูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 2 MB' });
      const uploaded = await uploadPublicImage({ bytes: Buffer.from(match[2], 'base64'), mime: match[1], project: 'temple' });
      return send(res, 200, { success: true, imageUrl: uploaded.url });
    }
    if (action === 'menu-save') {
      if (!admin) return send(res, 403, { success: false, message: 'เฉพาะ Admin จัดการเมนูได้' });
      const name = String(body.name_th || '').trim();
      const category = String(body.category || '');
      const imageUrl = String(body.image_url || '').trim();
      const existingId = String(body.menuId || '');
      const preparations = body.preparations || (category === 'blended' ? ['blended'] : ['hot']);
      if (!Array.isArray(preparations) || !preparations.length || preparations.length > 3 || preparations.some((p) => !['hot', 'iced', 'blended'].includes(p)) || !name || name.length > 100 || !['drip', 'blended'].includes(category)
          || (existingId && !/^[\w-]{1,80}$/.test(existingId))
          || (imageUrl && !/^https:\/\/media\.nathoeng\.com\/uploads\/temple\/[0-9]{4}\/[0-9]{2}\/[a-f0-9]{32}\.webp$/.test(imageUrl))
          || !Number.isInteger(Number(body.sort_order)) || Number(body.sort_order) < 0 || Number(body.sort_order) > 9999
          || typeof body.active !== 'boolean') return send(res, 400, { success: false, message: 'กรุณาตรวจชื่อ ประเภท รูปภาพ และลำดับเมนู' });
      const item = { name_th: name, name_en: String(body.name_en || name).trim().slice(0, 100),
        description: String(body.description || '').trim().slice(0, 500), category, image_url: imageUrl || null,
        active: body.active, sort_order: Number(body.sort_order), preparations: [...new Set(preparations)] };
      if (existingId) {
        const found = await lookup(base, key, 'kathin_drink_menu', `id=eq.${encodeURIComponent(existingId)}&select=id`);
        if (!found?.length) return send(res, 404, { success: false, message: 'ไม่พบเมนูที่ต้องการแก้ไข' });
        await rest(base, key, 'kathin_drink_menu', `id=eq.${encodeURIComponent(existingId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(item) });
      } else {
        item.id = `${category === 'blended' ? 'blend' : 'drip'}-${crypto.randomUUID()}`;
        await rest(base, key, 'kathin_drink_menu', '', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(item) });
      }
      return send(res, 200, { success: true });
    }
    if (action === 'order') {
      if (!/^(drip|blend)-/.test(String(body.menuId || ''))) return send(res, 400, { success: false, message: 'กรุณาเลือกเมนู' });
      const day = String(body.serviceDay || '');
      if (!['hot', 'iced', 'blended'].includes(body.preparation)) return send(res, 400, { success: false, message: 'กรุณาเลือก ร้อน เย็น หรือปั่น' });
      const result = await rest(base, key, 'rpc/place_kathin_drink_choice', '', {
        method: 'POST', body: JSON.stringify({ p_actor_id: actorId, p_member_id: String(body.memberId || actorId), p_menu_id: String(body.menuId), p_service_day: day, p_preparation: body.preparation })
      });
      return send(res, 200, { success: true, order: result });
    }
    if (action === 'transition' || action === 'recall') {
      if (!canServe) return send(res, 403, { success: false, message: 'ต้องได้รับสิทธิ์ Staff งานกฐินก่อน' });
      const recall = action === 'recall';
      const next = recall || body.status === 'accepted' ? 'accepted' : body.status === 'sent' ? 'sent' : '';
      if (!next || !Number.isSafeInteger(Number(body.orderId)) || Number(body.orderId) < 1) return send(res, 400, { success: false, message: 'ข้อมูลคิวไม่ถูกต้อง' });
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
      const scope = `id=eq.${Number(body.orderId)}&event_key=eq.${EVENT}&service_day=eq.${today}`;
      const current = (await lookup(base, key, 'kathin_drink_orders', `${scope}&select=id,status,accepted_at`))?.[0];
      const expectedStatus = !recall && next === 'accepted' ? 'pending' : 'accepted';
      if (!current || current.status !== expectedStatus) return send(res, 409, { success: false, message: 'สถานะคิวเปลี่ยนไปแล้ว หรือเป็นคิววันก่อน กรุณาอัปเดตรายการ' });
      const calledAt = new Date(Math.max(Date.now(), Date.parse(current.accepted_at) + 1 || 0)).toISOString();
      const patch = recall ? { accepted_at: calledAt } : next === 'accepted'
        ? { status: next, accepted_by: actorId, accepted_at: calledAt }
        : { status: next, sent_by: actorId, sent_at: new Date().toISOString() };
      const version = recall ? `&accepted_at=${current.accepted_at ? `eq.${encodeURIComponent(current.accepted_at)}` : 'is.null'}` : '';
      const changed = await rest(base, key, 'kathin_drink_orders', `${scope}&status=eq.${expectedStatus}${version}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
      });
      if (!changed?.length) return send(res, 409, { success: false, message: 'เจ้าหน้าที่ท่านอื่นเปลี่ยนคิวนี้แล้ว กรุณาอัปเดตรายการ' });
      // A manual recall is an audio event only. It never consumes another right or sends another LINE.
      const notification = !recall && next === 'accepted' ? await notifyQueueCall(changed[0], actorId) : null;
      return send(res, 200, { success: true, order: changed[0], notification,
        warning: notification?.status === 'failed' ? 'เรียกรับคิวแล้ว แต่ส่ง LINE ไม่สำเร็จ สมาชิกยังดูคิวบนหน้านี้ได้' : undefined });
    }
    if (action === 'grant') {
      if (!canServe || !/^[\w-]{1,100}$/.test(String(body.memberId || ''))) return send(res, 403, { success: false, message: 'ไม่มีสิทธิ์ออกสิทธิ์ให้สมาชิก' });
      await rest(base, key, 'rpc/grant_kathin_drink_right', '', { method: 'POST', body: JSON.stringify({ p_actor_id: actorId, p_member_id: String(body.memberId) }) });
      return send(res, 200, { success: true });
    }
    if (action === 'close' || action === 'open') {
      if (!admin) return send(res, 403, { success: false, message: 'เฉพาะ Admin ปิดหรือเปิดงานได้' });
      await rest(base, key, 'kathin_drink_event', `event_key=eq.${EVENT}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_open: action === 'open', updated_at: new Date().toISOString() }) });
      return send(res, 200, { success: true });
    }
    if (action === 'assign-staff' || action === 'remove-staff') {
      if (!admin || !/^[\w-]{1,100}$/.test(String(body.memberId || ''))) return send(res, 403, { success: false, message: 'เฉพาะ Admin จัดการสิทธิ์ Staff ได้' });
      if (action === 'assign-staff') await rest(base, key, 'kathin_drink_staff', '', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ member_id: String(body.memberId), assigned_by: actorId, active: true }) });
      else await rest(base, key, 'kathin_drink_staff', `member_id=eq.${encodeURIComponent(body.memberId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false }) });
      return send(res, 200, { success: true });
    }
    if (action === 'menu-active') {
      if (!admin || !/^[\w-]{1,80}$/.test(String(body.menuId || '')) || typeof body.active !== 'boolean') return send(res, 403, { success: false, message: 'เฉพาะ Admin จัดการเมนูได้' });
      await rest(base, key, 'kathin_drink_menu', `id=eq.${encodeURIComponent(body.menuId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: body.active }) });
      return send(res, 200, { success: true });
    }
    return send(res, 400, { success: false, message: 'ไม่รู้จักคำสั่งนี้' });
  } catch (error) {
    const message = String(error?.message || 'ดำเนินการไม่สำเร็จ');
    const status = /FORBIDDEN/.test(message) ? 403 : /NO_DRINK_RIGHT/.test(message) ? 409 : /INVALID_MENU|INVALID_SERVICE_DAY|INVALID_PREPARATION/.test(message) ? 400 : /EVENT_CLOSED|EVENT_NOT_ACTIVE/.test(message) ? 409 : 500;
    return send(res, status, { success: false, message: ({ NO_DRINK_RIGHT: 'สิทธิ์เครื่องดื่มไม่พอ กรุณาติดต่อโต๊ะเจ้าหน้าที่', EVENT_CLOSED: 'ปิดรับรายการเครื่องดื่มแล้ว', EVENT_NOT_ACTIVE: 'ขณะนี้อยู่นอกช่วงวันที่เปิดรับออร์เดอร์', FORBIDDEN: 'ไม่มีสิทธิ์ดำเนินการนี้' })[message] || message });
  }
}
