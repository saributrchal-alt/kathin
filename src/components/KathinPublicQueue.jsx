import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './KathinPublicQueue.css';

const eventDays = new Set(['2026-11-07', '2026-11-08']);
const bangkokDay = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
const shortQueue = value => value ? String(value).split('-').pop().padStart(3, '0') : '—';

function GuestQueueItem({ order, feature = false }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => { setPhotoFailed(false); }, [order?.member_photo]);
  return <article className={'kpublic-item' + (feature ? ' kpublic-feature' : '')}>
    <span className="kpublic-photo">
      {order.member_photo && !photoFailed
        ? <img src={order.member_photo} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
        : <span aria-hidden="true">👤</span>}
    </span>
    <div className="kpublic-item-info">
      <strong className="kpublic-number">{shortQueue(order.queue_number)}</strong>
      <span className="kpublic-owner">{order.member_name || 'ผู้ร่วมงาน'}</span>
      <small>{order.menu_name}</small>
    </div>
  </article>;
}
function QueueGroup({ title, items, className = '', empty = 'ยังไม่มีคิว', limit }) {
  const shown = Number.isInteger(limit) ? items.slice(0, limit) : items;
  return <section className={'kpublic-section ' + className} aria-label={title}>
    <div className="kpublic-section-title"><h2>{title}</h2><span>{items.length} คิว</span></div>
    <div className="kpublic-list">
      {shown.map(order => <GuestQueueItem key={order.id} order={order} />)}
      {!shown.length && <p className="kpublic-empty">{empty}</p>}
    </div>
  </section>;
}

export default function KathinPublicQueue({ orderDay }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const date = eventDays.has(orderDay) ? orderDay : (eventDays.has(bangkokDay()) ? bangkokDay() : '2026-11-07');
  const refresh = useCallback(async (signal) => {
    try {
      const response = await fetch('/api/kathin-drinks?view=public-board&day=' + encodeURIComponent(date), {
        credentials: 'include', cache: 'no-store', signal
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw Error(result.message || 'โหลดคิวไม่สำเร็จ');
      setPayload(result);
      setError('');
    } catch (err) {
      if (signal?.aborted) return;
      setError('ข้อมูลคิวไม่เป็นปัจจุบัน กรุณารอเชื่อมต่ออีกครั้ง');
    }
  }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const poll = window.setInterval(() => refresh(controller.signal), 4500);
    return () => { controller.abort(); window.clearInterval(poll); };
  }, [refresh]);

  const orders = useMemo(() => payload?.orders || [], [payload]);
  const ready = useMemo(() => orders.filter(o => o.status === 'ready' && !o.hidden)
    .sort((a,b) => (a.queue_seq || 0) - (b.queue_seq || 0)), [orders]);
  const preparing = useMemo(() => orders.filter(o => o.status === 'preparing' || o.status === 'accepted'), [orders]);
  const waiting = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);
  const calling = useMemo(() => [...ready].sort((a,b) =>
    String(b.ready_at || '').localeCompare(String(a.ready_at || '')) || (b.queue_seq - a.queue_seq))[0], [ready]);

  return <main className="kpublic-board">
    <header className="kpublic-header">
      <span className="kpublic-seal" aria-hidden="true">☸</span>
      <div><strong>คิวกาแฟและเครื่องดื่ม</strong><small>งานกฐินวัดพุทธอุทยานนาเทิง · 2569</small></div>
    </header>
    {error && <p role="status" className="kpublic-warning">{error}</p>}
    <div className="kpublic-main">
      <section className="kpublic-section kpublic-calling" aria-label="กำลังเรียกคิว">
        <div className="kpublic-section-title"><h2>กำลังเรียกคิว</h2></div>
        {calling ? <GuestQueueItem order={calling} feature /> :
          <p className="kpublic-empty">ยังไม่มีคิวที่กำลังเรียกรับ</p>}
      </section>
      <div className="kpublic-preparation">
        <QueueGroup title="กำลังเตรียม" items={preparing} empty="ยังไม่มีคิวกำลังเตรียม" limit={6} />
        <QueueGroup title="รอเตรียม" items={waiting} empty="ยังไม่มีคิวรอเตรียม" limit={8} />
      </div>
    </div>
    <QueueGroup title="เสร็จแล้วรอมารับ" items={ready} className="kpublic-ready" empty="ยังไม่มีเครื่องดื่มรอรับ" />
  </main>;
}
