import React, { useCallback, useEffect, useState } from 'react';
import KathinDrinkPanel from './components/KathinDrinkPanel.jsx';
import KathinQueueBoard from './components/KathinQueueBoard.jsx';
import KathinPublicQueue from './components/KathinPublicQueue.jsx';

export default function App() {
  const [sessionState, setSessionState] = useState('checking');
  const [connectionError, setConnectionError] = useState('');
  const [canStaff, setCanStaff] = useState(false);
  const [staffMode, setStaffMode] = useState(false);
  const [showBoard, setShowBoard] = useState(() => window.location.hash === '#queue-board');
  const [publicBoard, setPublicBoard] = useState(() => window.location.hash === '#public-board');
  const [lastOrderedDay, setLastOrderedDay] = useState(null);
  useEffect(() => {
    const sync = () => {
      setShowBoard(window.location.hash === '#queue-board');
      setPublicBoard(window.location.hash === '#public-board');
      if (window.location.hash === '#order-drink' || window.location.hash === '#my-queue') setStaffMode(false);
      if (window.location.hash === '#staff-dashboard') setStaffMode(true);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const openBoard = () => { setPublicBoard(false); setShowBoard(true); window.history.replaceState(null, '', '#queue-board'); };
  const showGuestBoard = order => {
    setLastOrderedDay(order?.service_day || null);
    setShowBoard(false);
    setPublicBoard(true);
    window.location.hash = 'public-board';
  };
  const leaveBoard = () => { setShowBoard(false); setStaffMode(true); window.history.replaceState(null, '', '#staff-dashboard'); };
  const updateAccess = useCallback((allowed) => {
    setCanStaff(allowed);
    if (!allowed) setStaffMode(false);
  }, []);
  const selectMode = (staff) => {
    setStaffMode(staff);
    setPublicBoard(false); setShowBoard(false);
    window.history.replaceState(null, '', staff ? '#staff-dashboard' : '#order-drink');
  };

  useEffect(() => {
    let cancelled = false;
    const failure = async (response, step) => {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.message || body?.error || '';
      } catch { /* A deployment error may return HTML. */ }
      return `${step} (HTTP ${response.status})${detail ? `: ${detail}` : ''}`;
    };
    const loadProfile = async () => {
      const response = await fetch('/api/kathin-drinks?view=member', { credentials: 'include', cache: 'no-store' });
      if (response.ok) {
        const body = await response.json();
        if (!cancelled) { const allowed = Boolean(body.staff || body.admin); setCanStaff(allowed); setStaffMode(allowed && !['#order-drink','#my-queue','#public-board'].includes(window.location.hash)); setSessionState('ready'); }
      }
      return response;
    };
    const connect = async () => {
      try {
        const local = await loadProfile();
        if (local.ok) return;
        if (local.status !== 401) { if (!cancelled) { setConnectionError(await failure(local, 'อ่านข้อมูลกฐิน')); setSessionState('offline'); } return; }
        const temple = await fetch('https://watt.nathoeng.com/api/line-login?route=kathin-session', { credentials: 'include', cache: 'no-store' });
        if (temple.status === 401) { if (!cancelled) setSessionState('signed-out'); return; }
        if (!temple.ok) throw new Error(await failure(temple, 'ยืนยันสมาชิกกับเว็บวัด'));
        const assertion = await temple.json();
        const exchange = await fetch('/api/kathin-drinks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'session-exchange', token: assertion.token }) });
        if (!exchange.ok) throw new Error(await failure(exchange, 'รับบัญชีที่เว็บกฐิน'));
        const verified = await loadProfile();
        if (!verified.ok) throw new Error(await failure(verified, 'อ่านสิทธิ์สมาชิก'));
      } catch (error) { if (!cancelled) { setConnectionError(error?.message || 'ติดต่อเซิร์ฟเวอร์ไม่ได้'); setSessionState('offline'); } }
    };
    connect();
    window.addEventListener('focus', connect);
    return () => { cancelled = true; window.removeEventListener('focus', connect); };
  }, []);

  return <>
    {!(sessionState === 'ready' && (publicBoard || (showBoard && canStaff))) && <header style={{ padding: '14px max(16px, calc((100vw - 1000px) / 2))', background: '#fffaf0', borderBottom: '1px solid #e8dfd0', color: '#57462b', fontWeight: 800 }}>วัดพุทธอุทยานนาเทิง · งานกฐิน 2569</header>}
    {sessionState === 'ready' && publicBoard ? <KathinPublicQueue orderDay={lastOrderedDay} /> : sessionState === 'ready' && showBoard && canStaff ? <KathinQueueBoard onClose={leaveBoard} /> : sessionState === 'checking' ? <main style={{ padding: 28, textAlign: 'center' }}>กำลังตรวจสอบบัญชีสมาชิก…</main> : sessionState === 'signed-out' ? <main style={{ maxWidth: 620, margin: '8vh auto', padding: 24, textAlign: 'center' }}><h1>เข้าสู่ระบบสมาชิกก่อน</h1><p>ใช้บัญชีสมาชิกวัดเพื่อดูสิทธิ์ สั่งเครื่องดื่ม และติดตามคิว</p><a href="https://watt.nathoeng.com/#login-page" style={{ display: 'inline-block', padding: '12px 18px', borderRadius: 12, background: '#376b4d', color: 'white', fontWeight: 800, textDecoration: 'none' }}>เข้าสู่ระบบสมาชิก</a><p style={{ color: '#756d61' }}>หลังเข้าสู่ระบบแล้ว กลับมาที่ kathin.nathoeng.com</p></main> : sessionState === 'offline' ? <main style={{ maxWidth: 620, margin: '7vh auto', padding: 28, textAlign: 'center' }}><h1 style={{ fontSize: 22 }}>เชื่อมต่อระบบไม่สำเร็จ</h1><p>{connectionError}</p><button type="button" onClick={() => window.location.reload()} style={{ padding: '11px 20px', border: 0, borderRadius: 10, background: '#376b4d', color: 'white', cursor: 'pointer' }}>ลองใหม่</button></main> : <>
      {canStaff && !publicBoard && <nav aria-label="หน้างานกฐิน" style={{ maxWidth: 1000, margin: '16px auto 0', padding: '0 16px', display: 'flex', flexWrap:'wrap', gap: 8 }}><button type="button" aria-pressed={!staffMode} onClick={() => selectMode(false)} style={{ padding: '10px 15px', border: 0, borderRadius: 10, background: staffMode ? '#ede7dd' : '#376b4d', color: staffMode ? '#4b4134' : 'white', fontWeight: 800 }}>คิวของฉัน</button><button type="button" aria-pressed={staffMode} onClick={() => selectMode(true)} style={{ padding: '10px 15px', border: 0, borderRadius: 10, background: staffMode ? '#376b4d' : '#ede7dd', color: staffMode ? 'white' : '#4b4134', fontWeight: 800 }}>แดชบอร์ดเจ้าหน้าที่กฐิน</button><button type="button" onClick={openBoard} style={{ padding: '10px 15px', border: 0, borderRadius: 10, background: '#9a732a', color: 'white', fontWeight: 800 }}>☕ จอคิวกาแฟ · จัดการบนจอ</button></nav>}
      <KathinDrinkPanel key={staffMode ? 'staff' : 'member'} lang="th" staffMode={staffMode} orderFirst={!staffMode} onOrderPlaced={showGuestBoard} onAccessChange={updateAccess} />
    </>}
  </>;
}
