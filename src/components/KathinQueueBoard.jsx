import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './KathinQueueBoard.css';

const DAYS = [
  { value: '2026-11-07', label: 'เสาร์ 7 พฤศจิกายน 2569' },
  { value: '2026-11-08', label: 'อาทิตย์ 8 พฤศจิกายน 2569' }
];
const todayInThailand = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
const startDay = () => todayInThailand() === '2026-11-08' ? '2026-11-08' : '2026-11-07';
const shortQueue = value => value ? String(value).split('-').pop().padStart(3, '0') : '—';
const operations = {
  pending: [{ action: 'accept', label: 'เริ่มเตรียมเครื่องดื่ม', tone: 'blue' }],
  accepted: [{ action: 'ready', label: 'ชงเสร็จ · พร้อมให้มารับและเรียกคิว', tone: 'green' }],
  preparing: [{ action: 'ready', label: 'ชงเสร็จ · พร้อมให้มารับและเรียกคิว', tone: 'green' }],
  ready: [
    { action: 'picked', label: 'เจ้าของรับเครื่องดื่มแล้ว', tone: 'green' },
    { action: 'hide', label: 'ซ่อนคิวจากจอ (ยังไม่รับ)', tone: 'muted' }
  ]
};

function Person({ order, size = 'small' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [order?.member_photo]);
  return <span className={'kboard-avatar kboard-avatar-' + size}>
    <span aria-hidden="true">👤</span>
    {order?.member_photo && !broken &&
      <img src={order.member_photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
  </span>;
}
function QueueCard({ order, onClick, large = false, badge }) {
  return <button type="button" className={'kboard-queue-card' + (large ? ' is-large' : '')}
    onClick={() => onClick(order)} aria-label={'จัดการคิว ' + order.queue_number}>
    <Person order={order} />
    <span className="kboard-q-info">
      <strong>{shortQueue(order.queue_number)}</strong>
      <span className="kboard-owner">{order.member_name}</span>
      <small>{order.menu_name}</small>
    </span>
    <span className="kboard-q-badge">{badge || 'แตะจัดการ'}</span>
  </button>;
}

export default function KathinQueueBoard({ onClose }) {
  const [day, setDay] = useState(startDay);
  const [data, setData] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [working, setWorking] = useState(false);
  const [displayOnly, setDisplayOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/kathin-drinks?view=board&day=' + day, {
        method: 'GET', cache: 'no-store', credentials: 'include'
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.message || 'ดึงข้อมูลคิวไม่สำเร็จ');
      setData(payload);
      setLastSync(Date.now());
      setError('');
    } catch (e) {
      setError(e.message || 'การเชื่อมต่อขัดข้อง');
    }
  }, [day]);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const poll = window.setInterval(refresh, 4500);
    return () => { window.clearTimeout(first); window.clearInterval(poll); };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setPage(p => p + 1), 11000);
    return () => window.clearInterval(timer);
  }, []);

  const orders = data?.orders || [];
  const ready = useMemo(() => orders.filter(o => o.status === 'ready' && !o.hidden), [orders]);
  const hidden = useMemo(() => orders.filter(o => o.status === 'ready' && o.hidden), [orders]);
  const preparing = useMemo(() => orders.filter(o => o.status === 'preparing' || o.status === 'accepted'), [orders]);
  const waiting = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);
  const calling = useMemo(() =>
    [...ready].sort((a, b) => {
      const diff = String(b.ready_at || '').localeCompare(String(a.ready_at || ''));
      return diff || b.queue_seq - a.queue_seq;
    })[0] || null, [ready]);
  const readyPageCount = Math.max(1, Math.ceil(ready.length / 8));
  const readyPage = page % readyPageCount;
  const visibleReady = ready.slice(readyPage * 8, readyPage * 8 + 8);
  const latestReadyId = calling?.id;

  const update = async (operation) => {
    if (!selected || working) return;
    setWorking(true); setError('');
    try {
      const response = await fetch('/api/kathin-drinks', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'board-action', orderId: selected.id, operation })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        if (response.status === 409) throw new Error('คิวนี้ถูกเจ้าหน้าที่อีกเครื่องเปลี่ยนสถานะแล้ว กรุณาดูข้อมูลล่าสุด');
        throw new Error(payload?.message || 'บันทึกคิวไม่สำเร็จ');
      }
      setSelected(null);
      setPage(0);
      await refresh();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
      await refresh();
      setSelected(null);
    } finally {
      setWorking(false);
    }
  };

  return <main className={'kboard' + (displayOnly ? ' kboard-display' : '')}>
    <header className="kboard-header">
      <div className="kboard-brand">
        <div className="kboard-seal" aria-hidden="true">☸</div>
        <div><strong>วัดพุทธอุทยานนาเทิง</strong><small>NATHOENG KATHIN 2569 · COFFEE QUEUE</small></div>
      </div>
      <div className="kboard-header-right">
        <span className="kboard-event-date">{DAYS.find(d => d.value === day)?.label}</span>
        <span className="kboard-live"><span>●</span> {error ? 'สัญญาณขัดข้อง' : 'คิวอัปเดตอัตโนมัติ'}</span>
      </div>
    </header>

    {!displayOnly && <nav className="kboard-controls" aria-label="เครื่องมือเจ้าหน้าที่">
      <label>วันรับเครื่องดื่ม <select value={day} onChange={e => {setDay(e.target.value);setData(null);setPage(0);setSelected(null);}}>
        {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select></label>
      <button onClick={() => refresh()}>↻ รีเฟรช</button>
      <button onClick={() => {setDisplayOnly(true);setSelected(null);}}>▣ จอประกาศอย่างเดียว</button>
      <button onClick={onClose}>← กลับหน้าจัดการเดิม</button>
    </nav>}
    {displayOnly && <button className="kboard-exit-display" type="button"
      onClick={() => setDisplayOnly(false)} aria-label="ออกจากโหมดจอแสดงผล">ออกจากโหมดจอ</button>}

    {error && <div className="kboard-error" role="alert">⚠ {error} — ตรวจสอบการเชื่อมต่อก่อนเรียกคิว</div>}
    <div className="kboard-content">
      <section className="kboard-featured">
        <div className="kboard-pill">☕ กำลังเรียกคิว · พร้อมรับ</div>
        {calling ? <>
          <Person order={calling} size="large" />
          <div className="kboard-featured-number">{shortQueue(calling.queue_number)}</div>
          <h1>{calling.member_name}</h1>
          <p>{calling.menu_name}</p>
          <div className="kboard-featured-prompt">กรุณามารับที่เคาน์เตอร์</div>
          {!displayOnly && <button className="kboard-featured-action" onClick={() => setSelected(calling)}>แตะเพื่อจัดการคิวนี้ ›</button>}
        </> : <>
          <span className="kboard-empty-cup" aria-hidden="true">☕</span>
          <div className="kboard-featured-number">—</div>
          <h1>ยังไม่มีคิวพร้อมรับ</h1><p>รอเจ้าหน้าที่เตรียมเครื่องดื่ม</p>
        </>}
      </section>

      <section className="kboard-upcoming">
        <div className="kboard-column-header">
          <div><small>NEXT IN LINE</small><h2>กำลังเตรียม / คิวถัดไป</h2></div>
          <span className="kboard-pending-count">{preparing.length + waiting.length} คิว</span>
        </div>
        <div className="kboard-upcoming-list">
          {preparing.slice(0, 3).map(o => <QueueCard key={o.id} order={o} badge="กำลังชง" onClick={q => !displayOnly && setSelected(q)} />)}
          {waiting.slice(0, 5).map(o => <QueueCard key={o.id} order={o} badge="รอเตรียม" onClick={q => !displayOnly && setSelected(q)} />)}
          {!preparing.length && !waiting.length && <div className="kboard-empty-list">ขณะนี้ไม่มีคิวรอเตรียม</div>}
        </div>
      </section>
    </div>

    <section className="kboard-ready">
      <div className="kboard-ready-heading">
        <div><strong>● เครื่องดื่มชงเสร็จ — รอเจ้าของมารับ</strong>
          <span>คิวจะอยู่จนกว่าเจ้าหน้าที่กดรับแล้วหรือซ่อน</span></div>
        <div className="kboard-ready-right"><b>{ready.length} คิว</b>
          {readyPageCount > 1 && <span>หน้า {readyPage + 1}/{readyPageCount}</span>}</div>
      </div>
      <div className="kboard-ready-list">
        {visibleReady.map(o => <QueueCard key={o.id} order={o} badge={o.id === latestReadyId ? 'กำลังเรียก' : 'พร้อมรับ'} onClick={q => !displayOnly && setSelected(q)} />)}
        {!ready.length && <div className="kboard-empty-list">ยังไม่มีแก้วพร้อมรับ</div>}
      </div>
    </section>

    {!displayOnly && <section className="kboard-hidden">
      <button onClick={() => setShowHidden(v => !v)} aria-expanded={showHidden}>
        {showHidden ? '▾' : '▸'} คิวที่ซ่อน ({hidden.length}) — คลิกเพื่อนำกลับมาแสดง
      </button>
      {showHidden && <div className="kboard-hidden-list">
        {hidden.map(o => <QueueCard key={o.id} order={o} badge="ซ่อนอยู่" onClick={setSelected} />)}
        {!hidden.length && <span>ยังไม่มีคิวที่ซ่อนอยู่</span>}
      </div>}
    </section>}

    <footer className="kboard-footer">
      <span>งานทอดกฐินสามัคคี 7–8 พฤศจิกายน 2569 · วัดพุทธอุทยานนาเทิง</span>
      <span>ขอบคุณทุกท่านที่มาร่วมบุญ 🙏</span>
    </footer>

    {selected && !displayOnly && <div className="kboard-modal-backdrop" role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget && !working) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-label={'จัดการคิว ' + selected.queue_number} className="kboard-modal">
        <span className="kboard-modal-kicker">STAFF · จัดการคิว</span>
        <div className="kboard-modal-number">{shortQueue(selected.queue_number)}</div>
        <h2>{selected.member_name}</h2>
        <p>{selected.menu_name}</p>
        <div className="kboard-modal-buttons">
          {(selected.hidden ? [{action:'show',label:'นำกลับมาแสดงบนจอ',tone:'green'},{action:'picked',label:'รับเครื่องดื่มแล้ว',tone:'muted'}] : operations[selected.status] || []).map(o =>
            <button key={o.action} disabled={working} className={'kboard-action-' + o.tone} onClick={() => update(o.action)}>{o.label}</button>)}
        </div>
        <button className="kboard-cancel" disabled={working} onClick={() => setSelected(null)}>ยกเลิก · ไม่เปลี่ยนสถานะ</button>
      </section>
    </div>}
    {!data && !error && <div className="kboard-loading" role="status">กำลังโหลดคิวจากระบบงานกฐิน…</div>}
  </main>;
}
