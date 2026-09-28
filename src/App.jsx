import React, { useEffect, useState } from 'react';
import KathinDrinkPanel from './components/KathinDrinkPanel.jsx';

export default function App() {
  const [sessionState, setSessionState] = useState('checking');
  const [connectionError, setConnectionError] = useState('');
  const [canStaff, setCanStaff] = useState(false);
  const [staffMode, setStaffMode] = useState(false);

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
        if (!cancelled) { setCanStaff(Boolean(body.staff || body.admin)); setStaffMode(Boolean(body.staff || body.admin)); setSessionState('ready'); }
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
    return () => { cancelled = true; };
  }, []);

  return <>
    <header style={{ padding: '14px max(16px, calc((100vw - 1000px) / 2))', background: '#fffaf0', borderBottom: '1px solid #e8dfd0', color: '#57462b', fontWeight: 800 }}>วัดพุทธอุทยานนาเทิง · งานกฐิน 2569</header>
    {sessionState === 'checking' ? <main style={{ padding: 28, textAlign: 'center' }}>กำลังตรวจสอบบัญชีสมาชิก…</main> : sessionState === 'signed-out' ? <main style={{ maxWidth: 620, margin: '8vh auto', padding: 24, textAlign: 'center' }}><h1>เข้าสู่ระบบสมาชิกก่อน</h1><p>ใช้บัญชีสมาชิกวัดเพื่อดูสิทธิ์ สั่งเครื่องดื่ม และติดตามคิว</p><a href="https://watt.nathoeng.com/#login-page" style={{ display: 'inline-block', padding: '12px 18px', borderRadius: 12, background: '#376b4d', color: 'white', fontWeight: 800, textDecoration: 'none' }}>เข้าสู่ระบบสมาชิก</a><p style={{ color: '#756d61' }}>หลังเข้าสู่ระบบแล้ว กลับมาที่ kathin.nathoeng.com</p></main> : sessionState === 'offline' ? <main style={{ maxWidth: 620, margin: '7vh auto', padding: 28, textAlign: 'center' }}><h1 style={{ fontSize: 22 }}>เชื่อมต่อระบบไม่สำเร็จ</h1><p>{connectionError}</p><button type="button" onClick={() => window.location.reload()} style={{ padding: '11px 20px', border: 0, borderRadius: 10, background: '#376b4d', color: 'white', cursor: 'pointer' }}>ลองใหม่</button></main> : <>
      {canStaff && <nav style={{ maxWidth: 1000, margin: '16px auto 0', padding: '0 16px', display: 'flex', gap: 8 }}><button onClick={() => setStaffMode(false)} style={{ padding: '10px 15px', border: 0, borderRadius: 10, background: staffMode ? '#ede7dd' : '#376b4d', color: staffMode ? '#4b4134' : 'white', fontWeight: 800 }}>คิวของฉัน</button><button onClick={() => setStaffMode(true)} style={{ padding: '10px 15px', border: 0, borderRadius: 10, background: staffMode ? '#376b4d' : '#ede7dd', color: staffMode ? 'white' : '#4b4134', fontWeight: 800 }}>จุดบริการ Staff</button></nav>}
      <KathinDrinkPanel key={staffMode ? 'staff' : 'member'} lang="th" staffMode={staffMode} />
    </>}
  </>;
}
