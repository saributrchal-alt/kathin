import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DrinkMenuEditor from './DrinkMenuEditor.jsx';
import { useQueueAudio, useQueuePolling } from './useQueueUpdates.js';
import './drinks.css';

const shortQueue = (value) => value ? String(value).split('-').pop().padStart(3, '0') : '—';
const PREPARATIONS = [['hot', 'ร้อน'], ['iced', 'เย็น'], ['blended', 'ปั่น']];
const typesFor = (item) => item.preparations || (item.category === 'blended' ? ['blended'] : ['hot']);
const typeLabel = (value) => PREPARATIONS.find(([key]) => key === value)?.[1] || '';

const formatServiceDay = (day, th) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString(th ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });

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

export default function KathinDrinkPanel({ user, lang = 'th', staffMode = false, onClose, onAccessChange }) {
  const th = lang !== 'en';
  const [data, setData] = useState(null);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [target, setTarget] = useState(null);
  const [editingMenu, setEditingMenu] = useState(null);
  const [selection, setSelection] = useState(null);
  const [queueStatus, setQueueStatus] = useState('pending');

  const load = useCallback(async ({ queueOnly = false, signal } = {}) => {
    const response = await fetch(`/api/kathin-drinks?view=${staffMode ? 'staff' : 'member'}${queueOnly ? '&queueOnly=1' : ''}`, { credentials: 'include', cache: 'no-store', signal });
    const body = await response.json();
    if (signal?.aborted) return;
    if (!response.ok || !body.success) {
      if (response.status === 401 || response.status === 403) { setData(null); onAccessChange?.(false); }
      throw new Error(body.message || 'โหลดข้อมูลไม่สำเร็จ');
    }
    onAccessChange?.(Boolean(body.staff || body.admin));
    setData(previous => {
      if (!queueOnly || !previous) return body;
      const used = new Set(body.orders.filter(o => String(o.member_id) === body.viewerId && o.status !== 'cancelled').map(o => String(o.right_id)));
      return { ...previous, ...body, availableRights: previous.rights.filter(r => !used.has(String(r.id))).length };
    });
  }, [staffMode, onAccessChange]);

  useQueuePolling(load, setMessage);
  const { sound, enableSound } = useQueueAudio(data, staffMode);
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
      if (action === 'order') { setMessage(`${th ? 'รับคิวแล้ว' : 'Queued'}: ${shortQueue(body.order.queue_number)}`); setSelection(null); }
      else setMessage(body.warning || (action === 'recall' ? (th ? 'เรียกเสียงซ้ำแล้ว' : 'Called again') : action === 'transition' && values.status === 'accepted'
        ? (th ? `เรียกรับคิว ${shortQueue(body.order.queue_number)} แล้ว${body.notification?.status === 'sent' ? ' · แจ้ง LINE แล้ว' : ''}` : 'Queue called')
        : (th ? 'บันทึกเรียบร้อย' : 'Saved')));
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setWorking(''); }
  };

  const choose = (member) => { setSelection(null); setTarget(member); setQuery(''); setMembers([]); };
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const day = data?.serviceDay || today;
  const eventLive = Boolean(data?.event && today >= data.event.starts_on && today <= data.event.ends_on);
  const canOrder = eventLive && Boolean(data?.event?.is_open) && (staffMode ? Boolean(target) : true);
  const orders = data?.orders || [];
  const activeOrders = orders.filter(o => o.service_day === day && ['pending', 'accepted'].includes(o.status));
  const todayOrders = orders.filter(o => o.service_day === day);
  const queueTabs = [
    { status:'pending', label:th?'ออร์เดอร์':'Orders', time:'created_at' },
    { status:'accepted', label:th?'เรียกรับ':'Called', time:'accepted_at' },
    { status:'sent', label:th?'รับแล้ว':'Collected', time:'sent_at' }
  ];
  const selectedQueueTab = queueTabs.find(tab => tab.status === queueStatus);
  const queueTime = order => Date.parse(order[selectedQueueTab.time]) || Date.parse(order.created_at) || Date.parse(order.service_day) || 0;
  const visibleStaffOrders = orders.filter(order => order.status === queueStatus)
    .sort((a,b) => queueTime(b) - queueTime(a) || Number(b.id) - Number(a.id));
  const selectQueueTabByKey = event => {
    const index = queueTabs.findIndex(tab => tab.status === queueStatus);
    const next = ({ArrowRight:(index+1)%queueTabs.length,ArrowLeft:(index+queueTabs.length-1)%queueTabs.length,Home:0,End:queueTabs.length-1})[event.key];
    if (next === undefined) return;
    event.preventDefault(); setQueueStatus(queueTabs[next].status);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
  };
  const wrap = { maxWidth: 1000, margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)', color: '#302b22' };
  const card = { background: '#fff', border: '1px solid #e8dfd0', borderRadius: 18, padding: 18, boxShadow: '0 5px 18px rgba(50,40,20,.06)' };
  const button = { border: 0, borderRadius: 12, padding: '11px 16px', background: '#376b4d', color: 'white', fontWeight: 800, cursor: 'pointer' };

  return <main style={wrap}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <div><small style={{ color: '#8d6b2e', fontWeight: 800 }}>KATHIN 2569 · 7–8 NOVEMBER</small><h1 style={{ margin: '5px 0', fontSize: 'clamp(24px,5vw,34px)' }}>{staffMode ? (th ? 'แดชบอร์ดเจ้าหน้าที่กฐิน' : 'Kathin Staff dashboard') : (th ? 'รับเครื่องดื่มฟรี 1 แก้ว' : 'Your free drink')}</h1>{staffMode && <p style={{margin:'6px 0',color:'#66756b'}}>{th?'จุดบริการเครื่องดื่ม · จัดการคิวและบริการสมาชิก':'Drink service · Queues and member assistance'}</p>}</div>
      {onClose && <button onClick={onClose} style={{ ...button, background: '#eee8dd', color: '#514838' }}>{th ? 'กลับ' : 'Back'}</button>}
    </div>
    {data?.admin && staffMode && <a href="#drink-menu-management" className="drink-secondary" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: 18 }}>จัดการเมนู / เพิ่มรูปเครื่องดื่ม ↓</a>}
    {data && staffMode && <section aria-label={th?'สรุปเครื่องดื่มวันนี้':'Today’s drink summary'} style={{marginBottom:18}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>
        {[
          ['pending',th?'รอเรียกรับ':'Waiting'],
          ['accepted',th?'เรียกรับแล้ว':'Called'],
          ['sent',th?'ส่งแล้ว':'Served']
        ].map(([status,label])=><div key={status} style={{...card,padding:12,textAlign:'center'}}><strong style={{display:'block',fontSize:28,color:'#376b4d'}}>{todayOrders.filter(order=>order.status===status).length}</strong><small>{label}</small></div>)}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',marginTop:12,fontSize:14}}>
        <span>{th?'สถานะรับรายการ: ':'Ordering: '}{eventLive && data.event.is_open ? (th?'เปิดบริการ':'Open') : (th?'ปิดรับรายการ':'Closed')}</span>
        <a href="#drink-staff-members" style={{color:'#376b4d',fontWeight:700}}>{th?'ช่วยสมาชิกสั่ง / เพิ่มสิทธิ์':'Assist members / Grant credits'}</a>
        <a href="#drink-staff-queues" style={{color:'#376b4d',fontWeight:700}}>{th?'จัดการคิว':'Manage queues'}</a>
      </div>
    </section>}
    {message && <div role="status" style={{ ...card, marginBottom: 14, background: '#fff9e9' }}>{message}</div>}
    {!data ? <div style={card}>{th ? 'กำลังโหลด...' : 'Loading...'}</div> : <>
      {!data.event.is_open && <div style={{ ...card, marginBottom: 14, background: '#f5f0e8' }}>{th ? 'ขณะนี้ปิดรับรายการเครื่องดื่มแล้ว' : 'Drink ordering is closed.'}</div>}
      {data.event.is_open && !eventLive && <div style={{ ...card, marginBottom: 14, background: '#fff9e9' }}>{th ? `ช่วงเปิดรับรายการ: ${formatServiceDay(data.event.starts_on, th)} – ${formatServiceDay(data.event.ends_on, th)}` : `Ordering period: ${formatServiceDay(data.event.starts_on, th)} – ${formatServiceDay(data.event.ends_on, th)}`}</div>}
      {staffMode && <section id="drink-staff-members" style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{th ? 'ค้นหาสมาชิกเพื่อช่วยสั่งหรือออกสิทธิ์' : 'Find a member'}</h2>
        <input value={query} onChange={(e) => { setQuery(e.target.value); setTarget(null); }} placeholder={th ? 'พิมพ์ชื่อสมาชิกอย่างน้อย 2 ตัวอักษร' : 'Search member name'} style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1px solid #d9cfbf', borderRadius: 10, fontSize: 16 }} />
        {members.length > 0 && query.trim().length >= 2 && <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{members.map((m) => <button key={m.id} onClick={() => choose(m)} style={{ textAlign: 'left', padding: 11, borderRadius: 9, border: '1px solid #e6dece', background: '#fff', cursor: 'pointer' }}>{m.name}</button>)}</div>}
        {target && <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}><strong>{target.name}</strong><button style={{ ...button, background: '#8b6531' }} disabled={Boolean(working)} onClick={() => fire('grant', { memberId: target.id })}>{th ? 'ออกสิทธิ์ฟรีเพิ่ม 1 แก้ว' : 'Grant one free drink'}</button>{data?.admin && <><button style={{ ...button, background: '#4d6582' }} disabled={Boolean(working)} onClick={() => fire('assign-staff', { memberId: target.id })}>{th ? 'กำหนดเป็น Staff' : 'Assign Staff'}</button><button style={{ ...button, background: '#eee8dd', color: '#514838' }} disabled={Boolean(working)} onClick={() => fire('remove-staff', { memberId: target.id })}>{th ? 'ถอนสิทธิ์ Staff' : 'Remove Staff'}</button></>}</div>}
      </section>}
      <section style={{ ...card, marginBottom: 16 }} aria-label={th ? 'คิวเครื่องดื่มวันนี้' : 'Today’s drink queues'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div><strong style={{ fontSize: 18 }}>{th ? 'คิวเครื่องดื่มวันนี้' : 'Today’s drink queues'}</strong><small style={{ display: 'block', marginTop: 4 }}>{formatServiceDay(day, th)}{!staffMode && (th ? ` · เหลือ ${data.availableRights || 0} สิทธิ์` : ` · ${data.availableRights || 0} rights left`)}</small></div>
          <button style={{ ...button, background: '#eee8dd', color: '#514838' }} onClick={() => load().catch((e) => setMessage(e.message))}>{th ? 'อัปเดตคิว' : 'Refresh queue'}</button>
        </div>
        <div className="drink-sound-controls">
          <button type="button" className="drink-secondary" onClick={enableSound}>{th ? (sound === 'ready' ? 'ทดสอบเสียงเรียกคิว' : 'เปิดและทดสอบเสียงเรียกคิว') : 'Enable / test queue sound'}</button>
          <small role="status">{th ? (sound === 'blocked' ? 'แตะปุ่มเปิดเสียง เพื่อให้เครื่องนี้เรียกคิวได้' : sound === 'error' ? 'เปิดไฟล์เสียงไม่ได้ กรุณาลองทดสอบเสียงอีกครั้ง' : sound === 'ready' ? 'เปิดเสียงแล้ว · เรียกครั้งเดียวต่อคิว' : 'แตะเปิดเสียงครั้งแรก · ตรวจคิวอัตโนมัติทุก 5 วินาที') : (sound === 'ready' ? 'Sound enabled · one announcement per call' : 'Tap to enable sound · queue updates every 5 seconds')}</small>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: staffMode ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ minWidth: 0, textAlign: 'center', padding: '20px 6px', borderRadius: 16, background: '#e9f3ec', border: '1px solid #b8d4c0' }}>
            <h2 style={{ fontSize: 'clamp(16px, 4.3vw, 22px)', margin: '0 0 14px', color: '#204c32' }}>{th ? 'คิวปัจจุบัน' : 'Current queue'}</h2>
            <b style={{ display: 'block', color: '#173b25', fontSize: 'clamp(48px, 14vw, 112px)', fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{shortQueue(data.currentQueue)}</b>
            <small style={{ display: 'block', marginTop: 12, color: '#365843' }}>{th ? 'คิวล่าสุดที่เรียกรับ' : 'Last queue called'}</small>
          </div>
          {!staffMode && <div style={{ minWidth: 0, textAlign: 'center', padding: '20px 6px', borderRadius: 16, background: '#fff5df', border: '1px solid #e6cc91' }}>
            <h2 style={{ fontSize: 'clamp(16px, 4.3vw, 22px)', margin: '0 0 14px', color: '#674613' }}>{th ? 'คิวของฉัน' : 'My queue'}</h2>
            {activeOrders.map((order, index) => <div key={order.id} style={{ marginTop: index ? 20 : 0, borderTop: index ? '1px solid #e6cc91' : undefined, paddingTop: index ? 16 : 0 }}>
              <b style={{ display: 'block', color: '#573b11', fontSize: 'clamp(48px, 14vw, 112px)', fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{shortQueue(order.queue_number)}</b>
              <div style={{ marginTop: 12, fontWeight: 700, overflowWrap: 'anywhere' }}>{menu.find((m) => m.id === order.menu_id)?.name_th || order.menu_id}{order.preparation && ` · ${typeLabel(order.preparation)}`}</div>
              {order.status === 'accepted' ? <div className="drink-ready" role="status">{th ? 'ถึงคิวแล้ว' : 'Your drink is ready'}</div> : <small style={{ display: 'block', marginTop: 6 }}>{th ? 'รอเรียกรับเครื่องดื่ม' : 'Waiting to be called'}</small>}
            </div>)}
            {!activeOrders.length && <><b style={{ display: 'block', fontSize: 'clamp(48px, 14vw, 112px)', lineHeight: 1.1, color: '#573b11' }}>—</b><small style={{ display: 'block', marginTop: 12 }}>{th ? 'ไม่มีคิวที่รอรับเครื่องดื่ม' : 'No drinks waiting for collection'}</small></>}
          </div>}
        </div>
        {!staffMode && orders.some((order) => order.service_day !== day) && <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', padding: '10px 0' }}>{th ? 'ดูรายการวันก่อน' : 'Previous orders'}</summary>
          {orders.filter((order) => order.service_day !== day).map((order) => <div key={order.id} style={{ padding: '10px 0', borderTop: '1px solid #eee8dd' }}><strong>{shortQueue(order.queue_number)}</strong> · {menu.find((m) => m.id === order.menu_id)?.name_th || order.menu_id} · {formatServiceDay(order.service_day, th)}</div>)}
        </details>}
      </section>
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
          <button className="drink-primary" disabled={!selection || !canOrder || Boolean(working) || !menu.some((m) => m.id === selection.menuId && m.active && typesFor(m).includes(selection.preparation)) || (!staffMode && data.availableRights < 1)} onClick={() => fire('order', { memberId: target?.id || user?.memberId, ...selection, serviceDay: day })}>{working ? 'กำลังดำเนินการ…' : !eventLive ? 'ยังไม่เปิดรับรายการในวันนี้' : !data.event.is_open ? 'ปิดรับรายการ' : staffMode && !target ? 'เลือกสมาชิกก่อนสั่ง' : !staffMode && data.availableRights < 1 ? 'ขอสิทธิ์เพิ่มที่โต๊ะเจ้าหน้าที่' : 'ยืนยันสั่ง 1 แก้ว'}</button>
        </div>
      </section>
      {staffMode && <section id="drink-staff-queues" style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <h2 style={{margin:0}}>{th?'จัดการคิว / ประวัติ':'Queues / History'}</h2>
          <button type="button" onClick={()=>load().catch(error=>setMessage(error.message))} style={{...button,background:'#eee8dd',color:'#514838'}}>{th?'รีเฟรชรายการ':'Refresh list'}</button>
        </div>
        <div role="tablist" aria-label={th?'สถานะรายการเครื่องดื่ม':'Drink order status'} style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6,marginTop:16}}>
          {queueTabs.map(tab=><button key={tab.status} type="button" role="tab" id={`drink-queue-tab-${tab.status}`} aria-controls="drink-queue-history" aria-selected={queueStatus===tab.status} tabIndex={queueStatus===tab.status?0:-1}
            onClick={()=>setQueueStatus(tab.status)} onKeyDown={selectQueueTabByKey}
            style={{...button,padding:'12px 6px',minWidth:0,background:queueStatus===tab.status?'#376b4d':'#f0ece5',color:queueStatus===tab.status?'#fff':'#514838'}}>
            {tab.label}<span style={{display:'block',fontSize:13,marginTop:3}}>{orders.filter(order=>order.status===tab.status).length}</span>
          </button>)}
        </div>
        <p style={{fontSize:13,color:'#756c60',margin:'10px 0'}}>{th?'รวมประวัติทุกวัน · รายการล่าสุดอยู่บนสุด':'All dates · Most recent first'}</p>
        <div role="tabpanel" id="drink-queue-history" aria-labelledby={`drink-queue-tab-${queueStatus}`} tabIndex={0} style={{display:'grid',gap:9,marginTop:14}}>
          {visibleStaffOrders.map(order=><article key={order.id} style={{border:'1px solid #e9e1d5',borderRadius:12,padding:13,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div>
              <b style={{display:'block',color:'#172d23',fontSize:'clamp(64px,18vw,96px)',fontWeight:900,lineHeight:1.1,fontVariantNumeric:'tabular-nums',marginBottom:10}}>{shortQueue(order.queue_number)}</b>
              <b>{order.member_name||'สมาชิก'}</b>
              <div>{menu.find(item=>item.id===order.menu_id)?.name_th||order.menu_id}{order.preparation&&` · ${typeLabel(order.preparation)}`} · {formatServiceDay(order.service_day,th)}</div>
              <small className={order.status==='accepted'?'drink-ready':undefined}>{({pending:th?'รอเรียกรับ':'Waiting to be called',accepted:th?'ถึงคิวแล้ว':'Ready for collection',sent:th?'รับเครื่องดื่มแล้ว':'Collected'})[order.status]}</small>
            </div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
              {order.status==='pending'&&<button type="button" style={button} disabled={Boolean(working)||order.service_day!==day} onClick={()=>fire('transition',{orderId:order.id,status:'accepted'})}>{th?'เรียกรับ':'Call for collection'}</button>}
              {order.status==='accepted'&&<>
                <button type="button" className="drink-secondary" disabled={Boolean(working)||order.service_day!==day} onClick={()=>fire('recall',{orderId:order.id})}>{th?'เรียกซ้ำ':'Call again'}</button>
                <button type="button" style={{...button,background:'#986b23'}} disabled={Boolean(working)||order.service_day!==day} onClick={()=>fire('transition',{orderId:order.id,status:'sent'})}>{th?'ส่งเครื่องดื่ม':'Handed off'}</button>
              </>}
            </div>
          </article>)}
          {!visibleStaffOrders.length&&<p>{th?`ยังไม่มีรายการในสถานะ “${selectedQueueTab.label}”`:`No ${selectedQueueTab.label.toLowerCase()} yet.`}</p>}
        </div>
      </section>}
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
