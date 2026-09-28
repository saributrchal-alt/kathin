import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DrinkMenuEditor from './DrinkMenuEditor.jsx';
import './drinks.css';

const PREPARATIONS = [['hot', 'ร้อน'], ['iced', 'เย็น'], ['blended', 'ปั่น']];
const typesFor = (item) => item.preparations || (item.category === 'blended' ? ['blended'] : ['hot']);
const typeLabel = (value) => PREPARATIONS.find(([key]) => key === value)?.[1] || '';

const DAY_CHOICES = [
  { value: '2026-11-07', label: 'เสาร์ 7 พ.ย. · คิว 7xxx' },
  { value: '2026-11-08', label: 'อาทิตย์ 8 พ.ย. · คิว 8xxx' }
];

function printDrinkMenu(menu) {
  const popup = window.open('', '_blank');
  if (!popup) return;
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const items = menu.filter((item) => item.active).map((item) => `<tr><td>${safe(item.name_th)}</td>${PREPARATIONS.map(([key]) => `<td>${typesFor(item).includes(key) ? '□' : '—'}</td>`).join('')}</tr>`).join('');
  popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เมนูเครื่องดื่มงานกฐิน 2569</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:36px auto;color:#302b22}h1{text-align:center;color:#376b4d}p{text-align:center}table{width:100%;border-collapse:collapse;font-size:20px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:center}td:first-child,th:first-child{text-align:left}footer{margin-top:36px;text-align:center;color:#776c5c}@page{size:A4;margin:18mm}</style></head><body><h1>เครื่องดื่มงานกฐิน 2569</h1><p>วัดพุทธอุทยานนาเทิง · 7–8 พฤศจิกายน 2569</p><p><strong>ฟรี 1 แก้วต่อ 1 สิทธิ์สมาชิก</strong></p><table><thead><tr><th>เมนู</th><th>ร้อน</th><th>เย็น</th><th>ปั่น</th></tr></thead><tbody>${items}</tbody></table><footer>เลือกเมนูและแจ้งเจ้าหน้าที่ หรือสั่งผ่าน kathin.nathoeng.com</footer></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export default function KathinDrinkPanel({ user, lang = 'th', staffMode = false, onClose }) {
  const th = lang !== 'en';
  const [data, setData] = useState(null);
  const [day] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }) === '2026-11-08' ? '2026-11-08' : '2026-11-07');
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [target, setTarget] = useState(null);
  const [editingMenu, setEditingMenu] = useState(null);
  const [selection, setSelection] = useState(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/kathin-drinks?view=${staffMode ? 'staff' : 'member'}`, { credentials: 'include', cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'โหลดข้อมูลไม่สำเร็จ');
    setData(body);
  }, [staffMode]);

  useEffect(() => { const timer = setTimeout(() => load().catch((error) => setMessage(error.message)), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { if (!staffMode || query.trim().length < 2) return undefined;
    const timer = setTimeout(async () => {
      try { const response = await fetch(`/api/kathin-drinks?view=lookup&q=${encodeURIComponent(query.trim())}`, { credentials: 'include', cache: 'no-store' }); const body = await response.json(); setMembers(body.members || []); }
      catch { setMembers([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, staffMode]);

  const menu = useMemo(() => data?.menu || [], [data]);
  const fire = async (action, values = {}) => {
    setWorking(action); setMessage('');
    try {
      const response = await fetch('/api/kathin-drinks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...values }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'บันทึกไม่สำเร็จ');
      if (action === 'order') { setMessage(`${th ? 'รับคิวแล้ว' : 'Queued'}: ${body.order.queue_number}`); setSelection(null); }
      else setMessage(th ? 'บันทึกเรียบร้อย' : 'Saved');
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setWorking(''); }
  };

  const choose = (member) => { setSelection(null); setTarget(member); setQuery(''); setMembers([]); };
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const eventLive = Boolean(data?.event && today >= data.event.starts_on && today <= data.event.ends_on);
  const canOrder = eventLive && Boolean(data?.event?.is_open) && (staffMode ? Boolean(target) : true);
  const orders = data?.orders || [];
  const wrap = { maxWidth: 1000, margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)', color: '#302b22' };
  const card = { background: '#fff', border: '1px solid #e8dfd0', borderRadius: 18, padding: 18, boxShadow: '0 5px 18px rgba(50,40,20,.06)' };
  const button = { border: 0, borderRadius: 12, padding: '11px 16px', background: '#376b4d', color: 'white', fontWeight: 800, cursor: 'pointer' };

  return <main style={wrap}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <div><small style={{ color: '#8d6b2e', fontWeight: 800 }}>KATHIN 2569 · 7–8 NOVEMBER</small><h1 style={{ margin: '5px 0', fontSize: 'clamp(24px,5vw,34px)' }}>{staffMode ? (th ? 'จัดการคิวเครื่องดื่ม' : 'Drink Service') : (th ? 'รับเครื่องดื่มฟรี 1 แก้ว' : 'Your free drink')}</h1></div>
      {onClose && <button onClick={onClose} style={{ ...button, background: '#eee8dd', color: '#514838' }}>{th ? 'กลับ' : 'Back'}</button>}
    </div>
    {data?.admin && staffMode && <a href="#drink-menu-management" className="drink-secondary" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: 18 }}>จัดการเมนู / เพิ่มรูปเครื่องดื่ม ↓</a>}
    {message && <div role="status" style={{ ...card, marginBottom: 14, background: '#fff9e9' }}>{message}</div>}
    {!data ? <div style={card}>{th ? 'กำลังโหลด...' : 'Loading...'}</div> : <>
      {!data.event.is_open && <div style={{ ...card, marginBottom: 14, background: '#f5f0e8' }}>{th ? 'ขณะนี้ปิดรับรายการเครื่องดื่มแล้ว' : 'Drink ordering is closed.'}</div>}
      {data.event.is_open && !eventLive && <div style={{ ...card, marginBottom: 14, background: '#fff9e9' }}>{th ? 'เปิดรับรายการเครื่องดื่มในวันที่ 7–8 พฤศจิกายน 2569 สิทธิ์ของสมาชิกแสดงไว้ล่วงหน้าแล้ว' : 'Ordering opens November 7–8, 2026. Your rights are already reserved.'}</div>}
      {staffMode && <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{th ? 'ค้นหาสมาชิกเพื่อช่วยสั่งหรือออกสิทธิ์' : 'Find a member'}</h2>
        <input value={query} onChange={(e) => { setQuery(e.target.value); setTarget(null); }} placeholder={th ? 'พิมพ์ชื่อสมาชิกอย่างน้อย 2 ตัวอักษร' : 'Search member name'} style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1px solid #d9cfbf', borderRadius: 10, fontSize: 16 }} />
        {members.length > 0 && query.trim().length >= 2 && <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{members.map((m) => <button key={m.id} onClick={() => choose(m)} style={{ textAlign: 'left', padding: 11, borderRadius: 9, border: '1px solid #e6dece', background: '#fff', cursor: 'pointer' }}>{m.name}</button>)}</div>}
        {target && <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}><strong>{target.name}</strong><button style={{ ...button, background: '#8b6531' }} disabled={Boolean(working)} onClick={() => fire('grant', { memberId: target.id })}>{th ? 'ออกสิทธิ์ฟรีเพิ่ม 1 แก้ว' : 'Grant one free drink'}</button>{data?.admin && <><button style={{ ...button, background: '#4d6582' }} disabled={Boolean(working)} onClick={() => fire('assign-staff', { memberId: target.id })}>{th ? 'กำหนดเป็น Staff' : 'Assign Staff'}</button><button style={{ ...button, background: '#eee8dd', color: '#514838' }} disabled={Boolean(working)} onClick={() => fire('remove-staff', { memberId: target.id })}>{th ? 'ถอนสิทธิ์ Staff' : 'Remove Staff'}</button></>}</div>}
      </section>}
      <section style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div><strong style={{ fontSize: 18 }}>{staffMode ? 'คิวที่ส่งแล้ว' : (th ? `สิทธิ์คงเหลือ ${data.availableRights || 0} แก้ว` : `${data.availableRights || 0} rights left`)}</strong><div style={{ color: '#736b60', marginTop: 4 }}>{th ? 'คิวปัจจุบันที่หน้าเคาท์เตอร์' : 'Current counter queue'}: <b style={{ color: '#9b712b', fontSize: 22 }}>{data.currentQueue || '—'}</b></div></div>
          <button style={{ ...button, background: '#eee8dd', color: '#514838' }} onClick={() => load().catch((e) => setMessage(e.message))}>{th ? 'อัปเดตคิว' : 'Refresh queue'}</button>
        </div>
      </section>
      {!staffMode && <section style={{ ...card, marginBottom: 16 }}>
        <strong>{th ? 'คิวของวันนี้' : 'Today’s queue'}: {DAY_CHOICES.find((d) => d.value === day)?.label}</strong>
      </section>}
      <section className="drink-check-menu" style={{ marginBottom: 24 }}>
        <h2>เลือกเครื่องดื่ม</h2><p className="drink-check-intro">ติ๊กเมนูและรูปแบบที่ต้องการ · 1 สิทธิ์ต่อ 1 แก้ว</p>
        <div role="radiogroup" aria-label="เลือกเครื่องดื่มและรูปแบบ">
          <div className="drink-check-row drink-check-head"><strong>เมนูเครื่องดื่ม</strong>{PREPARATIONS.map(([key, label]) => <strong key={key}>{label}</strong>)}</div>
          {menu.map((item) => <div className={`drink-check-row ${selection?.menuId === item.id ? 'drink-check-selected' : ''}`} key={item.id}>
            <div className="drink-check-name"><div className="drink-check-thumb">{item.image_url ? <img src={item.image_url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <span aria-hidden="true">{item.category === 'blended' ? '🥤' : '☕'}</span>}</div><div><strong>{th ? item.name_th : item.name_en || item.name_th}</strong>{item.description && <small>{item.description}</small>}{!item.active && <small>พักให้บริการ</small>}</div></div>
            {PREPARATIONS.map(([value, label]) => <div className="drink-check-cell" key={value}>{typesFor(item).includes(value) ? <label className="drink-check-control"><input type="radio" name="drink-choice" aria-label={`${item.name_th} ${label}`} checked={selection?.menuId === item.id && selection?.preparation === value} disabled={!item.active || Boolean(working)} onChange={() => setSelection({ menuId: item.id, preparation: value })} /><span aria-hidden="true">✓</span></label> : <span aria-label="ไม่มีรูปแบบนี้">—</span>}</div>)}
          </div>)}
        </div>
        {!menu.length && <p>กำลังจัดเตรียมเมนูเครื่องดื่ม</p>}
        <div className="drink-choice-summary" aria-live="polite"><div>{selection ? <><strong>{menu.find((m) => m.id === selection.menuId)?.name_th} · {typeLabel(selection.preparation)}</strong><small>จำนวน 1 แก้ว · ใช้ 1 สิทธิ์{staffMode && target ? ` · ${target.name}` : ''}</small></> : <span>เลือกช่องร้อน เย็น หรือปั่น ของเมนูที่ต้องการ</span>}</div>
          <button className="drink-primary" disabled={!selection || !canOrder || Boolean(working) || !menu.some((m) => m.id === selection.menuId && m.active && typesFor(m).includes(selection.preparation)) || (!staffMode && data.availableRights < 1)} onClick={() => fire('order', { memberId: target?.id || user?.memberId, ...selection, serviceDay: day })}>{working ? 'กำลังดำเนินการ…' : !eventLive ? 'เปิดสั่ง 7–8 พ.ย. 2569' : !data.event.is_open ? 'ปิดรับรายการ' : staffMode && !target ? 'เลือกสมาชิกก่อนสั่ง' : !staffMode && data.availableRights < 1 ? 'ขอสิทธิ์เพิ่มที่โต๊ะเจ้าหน้าที่' : 'ยืนยันสั่ง 1 แก้ว'}</button>
        </div>
      </section>
      {staffMode && <section style={card}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><h2 style={{ margin: 0 }}>{th ? 'รายการตามคิว' : 'Orders by queue'}</h2><button onClick={() => load().catch((e) => setMessage(e.message))} style={{ ...button, background: '#eee8dd', color: '#514838' }}>{th ? 'รีเฟรชรายการ' : 'Refresh list'}</button></div>
        <div style={{ display: 'grid', gap: 9, marginTop: 14 }}>{orders.map((order) => <article key={order.id} style={{ border: '1px solid #e9e1d5', borderRadius: 12, padding: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><b style={{ color: '#976b24', fontSize: 20 }}>{order.queue_number}</b> · <b>{order.member_name || 'สมาชิก'}</b><div>{menu.find((m) => m.id === order.menu_id)?.name_th || order.menu_id}{order.preparation && ` · ${typeLabel(order.preparation)}`} · {order.service_day === '2026-11-07' ? 'เสาร์ 7 พ.ย.' : 'อาทิตย์ 8 พ.ย.'}</div><small>{({ pending: 'รอรับออเดอร์', accepted: 'กำลังจัดเตรียม', sent: 'ส่งแล้ว', cancelled: 'ยกเลิก' })[order.status] || order.status}</small></div><div style={{ display: 'flex', gap: 7 }}>{order.status === 'pending' && <button style={button} disabled={Boolean(working)} onClick={() => fire('transition', { orderId: order.id, status: 'accepted' })}>{th ? 'รับออเดอร์' : 'Accept'}</button>}{order.status === 'accepted' && <button style={{ ...button, background: '#986b23' }} disabled={Boolean(working)} onClick={() => fire('transition', { orderId: order.id, status: 'sent' })}>{th ? 'ส่งออเดอร์' : 'Handed off'}</button>}</div></article>)}{!orders.length && <p>{th ? 'ยังไม่มีรายการในคิว' : 'No orders yet.'}</p>}</div>
      </section>}
      {!staffMode && <section style={{ ...card, marginTop: 16 }}><h2 style={{ marginTop: 0 }}>{th ? 'คิวของฉัน' : 'My queue numbers'}</h2>{orders.map((order) => <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid #eee8dd' }}><span>{menu.find((m) => m.id === order.menu_id)?.name_th || order.menu_id}{order.preparation && ` · ${typeLabel(order.preparation)}`}</span><b>{order.queue_number}</b></div>)}{!orders.length && <p>{th ? 'ยังไม่มีรายการสั่งเครื่องดื่ม' : 'No orders yet.'}</p>}</section>}
      {data.admin && staffMode && <section id="drink-menu-management" style={{ ...card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h2 style={{ margin: 0 }}>จัดการเมนูเครื่องดื่ม</h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="drink-primary" disabled={editingMenu !== null} onClick={() => setEditingMenu({})}>+ เพิ่มเมนู</button><button className="drink-secondary" onClick={() => printDrinkMenu(menu)}>พิมพ์เมนูหน้าเคาน์เตอร์</button></div></div>
        {editingMenu !== null && <DrinkMenuEditor key={editingMenu.id || 'new'} item={editingMenu} onCancel={() => setEditingMenu(null)} onSaved={async () => { await load(); setEditingMenu(null); setMessage('บันทึกเมนูเรียบร้อย สมาชิกเห็นข้อมูลล่าสุดเมื่ออัปเดตหน้า'); }} />}
        <div style={{ marginTop: 14 }}>{menu.map((item) => <div key={item.id} className="drink-admin-row">
          {item.image_url && <img src={item.image_url} alt="" loading="lazy" />}<span className="drink-admin-name"><strong>{item.name_th}</strong><br /><small>{item.category === 'blended' ? 'ปั่น' : 'ดริป / ชง'} · {item.active ? 'เปิดให้สั่ง' : 'พักให้บริการ'}</small></span>
          <button className="drink-secondary" disabled={editingMenu !== null || Boolean(working)} onClick={() => setEditingMenu(item)}>แก้ไข</button>
          <button style={{ ...button, background: item.active ? '#a04a3f' : '#376b4d' }} disabled={Boolean(working) || editingMenu !== null} onClick={() => fire('menu-active', { menuId: item.id, active: !item.active })}>{item.active ? 'พักให้บริการ' : 'เปิดให้สั่ง'}</button>
        </div>)}</div>
      </section>}
      {data.admin && staffMode && <section style={{ ...card, marginTop: 16 }}><h2 style={{ marginTop: 0 }}>{th ? 'สถานะระบบ' : 'Event status'}</h2><button style={{ ...button, background: data.event.is_open ? '#a04a3f' : '#376b4d' }} disabled={Boolean(working)} onClick={() => fire(data.event.is_open ? 'close' : 'open')}>{data.event.is_open ? (th ? 'ปิดรับรายการ' : 'Close ordering') : (th ? 'เปิดรับรายการ' : 'Open ordering')}</button></section>}
    </>}
  </main>;
}
