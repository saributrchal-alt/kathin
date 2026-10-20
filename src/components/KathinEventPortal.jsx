import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ink = '#302b22';
const green = '#376b4d';
const border = '#e8dfd0';
const panel = { background: '#fff', border: '1px solid ' + border, borderRadius: 18, padding: 18, boxShadow: '0 5px 18px rgba(50,40,20,.06)' };
const primaryButton = { border: 0, borderRadius: 12, padding: '11px 16px', background: green, color: '#fff', fontWeight: 800, cursor: 'pointer' };
const softButton = { border: '1px solid ' + border, borderRadius: 12, padding: '10px 14px', background: '#fffaf0', color: ink, fontWeight: 750, cursor: 'pointer' };
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #d8cdbb', borderRadius: 10, padding: '12px 13px', fontSize: 16, color: ink, background: '#fff' };
const EVENT_ROUTES = ['event-home', 'event-schedule', 'trip-itinerary', 'trip-booking'];

function SectionHeading({ eyebrow, title, description }) {
  return <div style={{ marginBottom: 18 }}>
    <small style={{ color: '#8d6b2e', fontWeight: 850, letterSpacing: '.04em' }}>{eyebrow || 'KATHIN 2569 · 7–8 NOVEMBER'}</small>
    <h1 style={{ margin: '6px 0', fontSize: 'clamp(25px,5vw,34px)', lineHeight: 1.25 }}>{title}</h1>
    {description && <p style={{ margin: '8px 0 0', color: '#6e6659', lineHeight: 1.65 }}>{description}</p>}
  </div>;
}

function EventTile({ icon, title, description, onClick, accent }) {
  return <button type="button" onClick={onClick} style={{
    ...panel, textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 14, width: '100%',
    cursor: 'pointer', minHeight: 126, borderTop: '4px solid ' + (accent || '#b58a3b')
  }}>
    <span aria-hidden="true" style={{ fontSize: 32, lineHeight: 1.25 }}>{icon}</span>
    <span style={{ display: 'block', flex: 1 }}>
      <strong style={{ display: 'block', fontSize: 18, lineHeight: 1.4 }}>{title}</strong>
      <span style={{ display: 'block', marginTop: 7, color: '#6e6659', fontSize: 14, lineHeight: 1.6 }}>{description}</span>
      <span style={{ display: 'block', marginTop: 12, color: green, fontWeight: 850 }}>เปิดเมนู <span aria-hidden="true">→</span></span>
    </span>
  </button>;
}

function InfoRow({ time, title, detail }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(105px, .65fr) minmax(0, 2fr)', gap: 14, padding: '15px 0', borderBottom: '1px solid #eee6da' }}>
    <strong style={{ color: '#8d6b2e', lineHeight: 1.55 }}>{time}</strong>
    <div>
      <strong style={{ display: 'block', lineHeight: 1.5 }}>{title}</strong>
      <p style={{ margin: '5px 0 0', color: '#6e6659', lineHeight: 1.65 }}>{detail}</p>
    </div>
  </div>;
}

function SeatButton({ van, seatNumber, booked, mine, disabled, onClick }) {
  const background = mine ? '#dceee2' : booked ? '#f4e3e1' : '#fff';
  const seatBorder = mine ? '#4f8a64' : booked ? '#c88780' : '#d7cbb8';
  const color = mine ? '#24583a' : booked ? '#8b3f39' : ink;
  return <button
    type="button"
    aria-label={'รถตู้คันที่ ' + van.van_number + ' เบาะ ' + seatNumber + (mine ? ' ที่นั่งของฉัน' : booked ? ' จองแล้ว' : ' ว่าง')}
    aria-pressed={Boolean(mine)}
    disabled={disabled || booked}
    onClick={onClick}
    style={{
      minHeight: 64, borderRadius: 12, border: '2px solid ' + seatBorder, background,
      color, cursor: disabled || booked ? 'not-allowed' : 'pointer', opacity: disabled && !booked ? .65 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
      fontWeight: 850, boxShadow: mine ? 'inset 0 0 0 1px #fff' : 'none'
    }}>
    <span style={{ fontSize: 19 }}>{seatNumber}</span>
    <span style={{ fontSize: 11 }}>{mine ? 'ของฉัน' : booked ? 'จองแล้ว' : 'ว่าง'}</span>
  </button>;
}

export default function KathinEventPortal({ route = 'event-home', onNavigate }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState('');
  const [profile, setProfile] = useState({ phone: '', passport_status: '' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [showAdminBookings, setShowAdminBookings] = useState(true);
  const profileInitialized = useRef(false);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/kathin-drinks?view=trip', {
      credentials: 'include', cache: 'no-store'
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'โหลดข้อมูลทริปไม่สำเร็จ');
    setData(body);
    setLoadError('');
    hasLoaded.current = true;
    if (!profileInitialized.current) {
      const saved = body.profile || {};
      setProfile({ phone: saved.phone || '', passport_status: saved.passport_status || '' });
      setProfileSaved(Boolean(saved.phone && saved.passport_status));
      profileInitialized.current = true;
    }
    return body;
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = () => load().catch(error => {
      if (mounted && !hasLoaded.current) setLoadError(error.message || 'เชื่อมต่อระบบจองไม่สำเร็จ');
    });
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [load]);

  const navigate = next => onNavigate?.(EVENT_ROUTES.includes(next) || next === 'order-drink' ? next : 'event-home');
  const seats = useMemo(() => data?.seats || [], [data]);
  const myBookings = useMemo(() => data?.myBookings || [], [data]);
  const bookedSet = useMemo(() => new Set(seats.map(item => String(item.van_id) + ':' + String(item.seat_number))), [seats]);
  const mySet = useMemo(() => new Set(myBookings.map(item => String(item.van_id) + ':' + String(item.seat_number))), [myBookings]);
  const profileValid = /^[+0-9() -]{8,20}$/.test(String(profile.phone || '').trim()) && ['yes', 'no'].includes(profile.passport_status);
  const mayChooseSeat = Boolean(profileSaved && profileValid);

  const post = async (action, values = {}) => {
    const response = await fetch('/api/kathin-drinks', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...values })
    });
    const body = await response.json();
    if (!response.ok || !body.success) {
      const error = new Error(body.message || 'บันทึกไม่สำเร็จ');
      error.status = response.status;
      throw error;
    }
    return body;
  };

  const saveProfile = async event => {
    event.preventDefault();
    if (!profileValid || working) return;
    setWorking('profile');
    setMessage('');
    try {
      const result = await post('trip-profile-save', {
        phone: String(profile.phone).trim(),
        passport_status: profile.passport_status
      });
      setProfile({ phone: result.profile?.phone || String(profile.phone).trim(), passport_status: result.profile?.passport_status || profile.passport_status });
      setProfileSaved(true);
      profileInitialized.current = true;
      setData(current => current ? { ...current, profile: result.profile || profile } : current);
      setMessage('บันทึกข้อมูลติดต่อและสถานะ Passport แล้ว สามารถเลือกเบาะได้ทันที');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking('');
    }
  };

  const bookSeat = async (van, seatNumber) => {
    if (!mayChooseSeat || working) {
      if (!mayChooseSeat) setMessage('กรุณากรอกเบอร์โทรศัพท์และสถานะ Passport แล้วกดบันทึกก่อนเลือกเบาะ');
      return;
    }
    setWorking('seat:' + van.id + ':' + seatNumber);
    setMessage('');
    try {
      await post('trip-book', { vanId: van.id, seatNumber });
      await load();
      setMessage('จองรถตู้คันที่ ' + van.van_number + ' เบาะ ' + seatNumber + ' สำเร็จแล้ว');
    } catch (error) {
      setMessage(error.message || 'จองเบาะไม่สำเร็จ กรุณาเลือกเบาะอื่น');
      await load().catch(() => {});
    } finally {
      setWorking('');
    }
  };

  const cancelBooking = async booking => {
    if (working) return;
    if (!window.confirm('ต้องการยกเลิกการจองรถตู้คันที่ ' + booking.van_number + ' เบาะ ' + booking.seat_number + ' ใช่หรือไม่?')) return;
    setWorking('cancel:' + booking.id);
    setMessage('');
    try {
      await post('trip-cancel', { bookingId: booking.id });
      await load();
      setMessage('ยกเลิกการจองแล้ว เบาะนี้เปิดให้สมาชิกคนอื่นจองได้');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking('');
    }
  };

  const addVan = async () => {
    if (!data?.admin || working) return;
    setWorking('add-van');
    setMessage('');
    try {
      const result = await post('trip-add-van');
      await load();
      setMessage('เพิ่มรถตู้คันที่ ' + result.van.van_number + ' แล้ว พร้อมเปิดให้จอง 13 เบาะ');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking('');
    }
  };

  const pageTitle = route === 'event-schedule' ? 'ตารางกำหนดการงานกฐิน'
    : route === 'trip-itinerary' ? 'ตารางการเที่ยวทัศนาจรสำหรับเจ้าภาพ'
    : route === 'trip-booking' ? 'จองที่นั่งรถตู้ทัศนาจร'
    : 'เจ้าภาพงานกฐิน';

  return <main style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(16px, 4vw, 30px)', paddingBottom: 36, color: ink }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
      <div>
        <small style={{ color: '#8d6b2e', fontWeight: 850 }}>วัดพุทธอุทยานนาเทิง · กฐิน 2569</small>
        <h1 style={{ margin: '5px 0', fontSize: 'clamp(23px,4vw,30px)' }}>{pageTitle}</h1>
      </div>
      {route !== 'event-home' && <button type="button" onClick={() => navigate('event-home')} style={softButton}>← กลับเมนูเจ้าภาพ</button>}
    </div>

    {message && <div role="status" style={{ ...panel, marginBottom: 16, background: '#fff9e9', borderColor: '#e5d2a6', lineHeight: 1.6 }}>{message}</div>}
    {loadError && <div role="alert" style={{ ...panel, marginBottom: 16, background: '#fff2f0', borderColor: '#d9a29b' }}>{loadError} <button type="button" style={softButton} onClick={() => load().catch(error => setLoadError(error.message))}>ลองอีกครั้ง</button></div>}

    {route === 'event-home' && <>
      <div style={{ ...panel, background: 'linear-gradient(120deg,#fff9e8,#f2e6ca)', border: '2px solid #b58a3b', marginBottom: 18 }}>
        <div style={{ fontSize: 34, marginBottom: 8 }} aria-hidden="true">🙏 🚌</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 23 }}>ยินดีต้อนรับเจ้าภาพและญาติโยม</h2>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#5d503c' }}>เลือกดูข้อมูลเครื่องดื่ม กำหนดการงานกฐิน โปรแกรมทัศนาจร หรือจองเบาะรถตู้ล่วงหน้าได้จากเมนูด้านล่าง</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 14 }}>
        <EventTile icon="☕" title="เลือกออร์เดอร์เครื่องดื่ม" description="เข้าสู่หน้าสั่งเครื่องดื่มของงานกฐินที่มีอยู่เดิม" onClick={() => navigate('order-drink')} accent="#8d6b2e" />
        <EventTile icon="🗓️" title="ตารางกำหนดการงานกฐิน" description="ดูภาพรวมกิจกรรมวันที่ 7–8 พฤศจิกายน 2569" onClick={() => navigate('event-schedule')} accent="#6f8e6c" />
        <EventTile icon="🛣️" title="ตารางการเที่ยวทัศนาจรสำหรับเจ้าภาพ" description="กำหนดการเดินทาง ข้ามสะพานมิตรภาพไทย–ลาว และกลับวัดก่อน 16.00 น." onClick={() => navigate('trip-itinerary')} accent="#6e8ca8" />
        <EventTile icon="🚌" title="การจองทริป" description="เลือกรถตู้และกดเลือกเบาะที่ว่างเพื่อจองทันที" onClick={() => navigate('trip-booking')} accent="#b58a3b" />
      </div>
      <p style={{ marginTop: 18, color: '#776c5c', fontSize: 13, lineHeight: 1.6 }}>กำหนดการบางช่วงอาจปรับตามสถานการณ์ ทางวัดจะแจ้งรายละเอียดเพิ่มเติมผ่านช่องทางสมาชิก</p>
    </>}

    {route === 'event-schedule' && <section style={panel}>
      <SectionHeading title="งานกฐินวัดพุทธอุทยานนาเทิง" description="กำหนดการโดยสังเขป วันที่ 7–8 พฤศจิกายน 2569 (รายละเอียดพิธีที่ยังไม่ระบุเวลาจะแจ้งเพิ่มเติม)" />
      <InfoRow time="วันเสาร์ 7 พ.ย." title="ต้อนรับเจ้าภาพและญาติโยม" detail="รับคณะที่เดินทางมาถึงวัด และเตรียมความพร้อมสำหรับกิจกรรมทัศนาจร" />
      <InfoRow time="ช่วงกลางวัน" title="ทัศนาจรในพื้นที่จังหวัดบึงกาฬ" detail="เดินทางชมพื้นที่ตามแผน และข้ามสะพานมิตรภาพไทย–ลาว โดยรถตู้ที่จัดเตรียมไว้" />
      <InfoRow time="ก่อน 16.00 น." title="เดินทางกลับถึงวัดนาเทิง" detail="กลับให้ทันเวลาเพื่อเตรียมร่วมพิธีในช่วงเย็น" />
      <InfoRow time="ช่วงเย็น" title="พิธีพาแลงและสู่ขวัญ" detail="ร่วมรับประทานอาหารและพิธีสู่ขวัญตามประเพณีอีสาน" />
      <InfoRow time="วันอาทิตย์ 8 พ.ย." title="พิธีงานทอดกฐิน" detail="กำหนดการพิธีหลักจะแจ้งเพิ่มเติมโดยทางวัด" />
    </section>}

    {route === 'trip-itinerary' && <section style={panel}>
      <SectionHeading title="โปรแกรมทัศนาจรสำหรับเจ้าภาพ" description="วันเสาร์ที่ 7 พฤศจิกายน 2569 · เป้าหมายสำคัญคือกลับถึงวัดก่อนเวลา 16.00 น." />
      <InfoRow time="ช่วงเช้า" title="รวมคณะ ณ วัดพุทธอุทยานนาเทิง" detail="ต้อนรับญาติโยมที่เดินทางมาจากต่างจังหวัด และเตรียมตัวออกเดินทาง" />
      <InfoRow time="ระหว่างวัน" title="ทัศนาจรในพื้นที่จังหวัดบึงกาฬ" detail="เดินทางชมสถานที่ในพื้นที่ตามแผนที่พระอาจารย์กำหนด" />
      <InfoRow time="ตามแผนการเดินทาง" title="ข้ามสะพานมิตรภาพไทย–ลาว" detail="รถตู้ที่จัดเตรียมจาก สปป.ลาว มารอรับที่ฝั่งไทย เพื่อพาคณะข้ามแดนและท่องเที่ยวตามแผน" />
      <InfoRow time="ระหว่างทริป" title="กราบนมัสการวัดอาฮงศิลาวาส" detail="กราบพระและชมบริเวณสะดือแม่น้ำโขง" />
      <InfoRow time="ก่อน 16.00 น." title="กลับถึงวัดนาเทิง" detail="ต้องกลับให้ทันกำหนดเพื่อร่วมกิจกรรมภาคเย็น" />
      <InfoRow time="ช่วงเย็น" title="ร่วมพิธีพาแลงและสู่ขวัญ" detail="ร่วมพิธีต้อนรับและรับประทานอาหารตามประเพณีอีสาน" />
      <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#fff7e6', border: '1px solid #ead7ac', lineHeight: 1.7 }}>
        <strong>เอกสารผ่านแดน:</strong> ผู้เดินทางต้องมีเอกสารที่ด่านอนุญาตให้ใช้ได้ ผู้ที่ไม่มี Passport โปรดแจ้งสถานะในระบบจองเพื่อให้ทางวัดตรวจสอบเรื่องบัตรประชาชนและหนังสือผ่านแดนชั่วคราว (Border Pass) ก่อนเดินทาง การจองที่นั่งไม่ใช่การรับรองสิทธิผ่านแดน
      </div>
    </section>}

    {route === 'trip-booking' && <>
      <div style={{ ...panel, marginBottom: 16, background: '#fffaf0' }}>
        <SectionHeading title="เลือกรถและเลือกเบาะด้วยตนเอง" description="กดเบาะที่ยังว่างเพื่อจองทันที ระบบจะล็อกเบาะนั้นไม่ให้สมาชิกคนอื่นจองซ้ำ ไม่ต้องกดยืนยันซ้ำอีกครั้ง" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ padding: '6px 9px', borderRadius: 8, background: '#fff', border: '1px solid #d7cbb8' }}>□ ว่าง</span>
          <span style={{ padding: '6px 9px', borderRadius: 8, background: '#dceee2', border: '1px solid #4f8a64' }}>✓ ที่นั่งของฉัน</span>
          <span style={{ padding: '6px 9px', borderRadius: 8, background: '#f4e3e1', border: '1px solid #c88780' }}>× จองแล้ว</span>
        </div>
      </div>

      <section style={{ ...panel, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 21 }}>ข้อมูลติดต่อและเอกสารผ่านแดน</h2>
        <p style={{ margin: '0 0 15px', color: '#6e6659', lineHeight: 1.6 }}>กรอกข้อมูลครั้งแรกและบันทึกก่อนเลือกเบาะ ข้อมูลนี้ใช้สำหรับประสานงานการเดินทางกับเจ้าหน้าที่วัด</p>
        <form onSubmit={saveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: 14 }}>
          <label style={{ display: 'block', fontWeight: 750 }}>เบอร์โทรศัพท์ติดต่อ
            <input style={{ ...inputStyle, marginTop: 7 }} type="tel" autoComplete="tel" inputMode="tel" value={profile.phone} onChange={event => { setProfile({ ...profile, phone: event.target.value }); setProfileSaved(false); }} placeholder="เช่น 0812345678" minLength={8} maxLength={20} required />
          </label>
          <fieldset style={{ margin: 0, padding: 12, border: '1px solid #d8cdbb', borderRadius: 12 }}>
            <legend style={{ padding: '0 5px', fontWeight: 750 }}>มี Passport หรือไม่?</legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0' }}>
              <input type="radio" name="passport-status" value="yes" checked={profile.passport_status === 'yes'} onChange={() => { setProfile({ ...profile, passport_status: 'yes' }); setProfileSaved(false); }} required />
              มี Passport
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0' }}>
              <input type="radio" name="passport-status" value="no" checked={profile.passport_status === 'no'} onChange={() => { setProfile({ ...profile, passport_status: 'no' }); setProfileSaved(false); }} required />
              ไม่มี Passport
            </label>
          </fieldset>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
            <button type="submit" style={{ ...primaryButton, opacity: !profileValid || working ? .6 : 1 }} disabled={!profileValid || Boolean(working)}>{working === 'profile' ? 'กำลังบันทึก…' : profileSaved ? 'บันทึกข้อมูลแล้ว · แก้ไขข้อมูล' : 'บันทึกข้อมูลเพื่อเลือกเบาะ'}</button>
            <small style={{ color: profileSaved ? green : '#776c5c', lineHeight: 1.5 }}>{profileSaved ? 'ข้อมูลพร้อมใช้งาน เลือกเบาะที่ว่างได้ทันที' : 'ต้องบันทึกเบอร์โทรและสถานะ Passport ก่อนจึงจะจองได้'}</small>
          </div>
        </form>
        {profile.passport_status === 'no' && <p style={{ margin: '13px 0 0', padding: 12, background: '#fff7e6', borderRadius: 10, color: '#6a4d1e', lineHeight: 1.65 }}>ไม่มี Passport: ทางวัดจะตรวจสอบเงื่อนไขการใช้บัตรประชาชนและหนังสือผ่านแดนชั่วคราว (Border Pass) ให้ทราบอีกครั้ง การเลือกตัวเลือกนี้ยังไม่ยืนยันว่าจะผ่านแดนได้</p>}
      </section>

      {myBookings.length > 0 && <section style={{ ...panel, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>ที่นั่งที่ฉันจองไว้</h2>
        <div style={{ display: 'grid', gap: 9 }}>
          {myBookings.map(booking => {
            const van = (data?.vans || []).find(item => String(item.id) === String(booking.van_id));
            return <div key={booking.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 12, borderRadius: 12, background: '#edf6ef', border: '1px solid #c8dfce' }}>
              <strong>รถตู้คันที่ {booking.van_number || van?.van_number || '—'} · เบาะ {booking.seat_number}</strong>
              <button type="button" style={{ ...softButton, color: '#8b3f39' }} disabled={Boolean(working)} onClick={() => cancelBooking({ ...booking, van_number: booking.van_number || van?.van_number || '—' })}>ยกเลิกที่นั่ง</button>
            </div>;
          })}
        </div>
      </section>}

      {!data && !loadError ? <div style={panel}>กำลังโหลดแผนผังเบาะรถตู้…</div> : <div style={{ display: 'grid', gap: 16 }}>
        {(data?.vans || []).map(van => {
          const occupied = seats.filter(seat => String(seat.van_id) === String(van.id)).length;
          const rows = [[1, null, 'driver'], [2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 12, 13]];
          return <section key={van.id} style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 21 }}>รถตู้คันที่ {van.van_number}</h2>
                <p style={{ margin: '5px 0 0', color: '#6e6659', fontSize: 14 }}>ว่าง {Math.max(0, van.seat_count - occupied)} / {van.seat_count} เบาะ</p>
              </div>
              <span style={{ fontSize: 12, color: '#776c5c' }}>ด้านหน้ารถ ↑</span>
            </div>
            <div style={{ maxWidth: 460, margin: '0 auto', border: '2px solid #d7cbb8', borderRadius: '22px 22px 14px 14px', padding: 12, background: '#f9f5ed' }}>
              <div style={{ textAlign: 'center', color: '#8d6b2e', fontSize: 11, fontWeight: 850, marginBottom: 9 }}>ด้านหน้ารถ</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                {rows.flatMap((row, rowIndex) => row.map((seatNumber, colIndex) => {
                  if (seatNumber === null) return <div key={'gap-' + rowIndex + '-' + colIndex} />;
                  if (seatNumber === 'driver') return <div key="driver" style={{ minHeight: 64, borderRadius: 12, background: '#e7e0d4', color: '#766b5b', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 12, fontWeight: 800 }}>คนขับ<br/>รถ</div>;
                  const key = String(van.id) + ':' + String(seatNumber);
                  const booked = bookedSet.has(key);
                  const mine = mySet.has(key);
                  return <SeatButton key={seatNumber} van={van} seatNumber={seatNumber} booked={booked} mine={mine} disabled={!mayChooseSeat || Boolean(working)} onClick={() => bookSeat(van, seatNumber)} />;
                }))}
              </div>
            </div>
          </section>;
        })}
        {data?.vans?.length === 0 && <div style={panel}>ยังไม่มีรถตู้ที่เปิดให้จอง กรุณาติดต่อผู้ดูแล</div>}
      </div>}

      {data?.admin && <section style={{ ...panel, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 21 }}>เครื่องมือผู้ดูแล</h2>
            <p style={{ margin: '5px 0 0', color: '#6e6659' }}>เพิ่มรถตู้และตรวจสอบรายชื่อผู้จองทุกคัน</p>
          </div>
          <button type="button" style={primaryButton} disabled={Boolean(working)} onClick={addVan}>{working === 'add-van' ? 'กำลังเพิ่มรถ…' : '+ เพิ่มรถตู้คันถัดไป'}</button>
        </div>
        <div style={{ marginTop: 16 }}>
          <button type="button" style={softButton} aria-expanded={showAdminBookings} onClick={() => setShowAdminBookings(value => !value)}>{showAdminBookings ? 'ซ่อนรายชื่อผู้จอง' : 'แสดงรายชื่อผู้จอง'}</button>
          {showAdminBookings && <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660, fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', background: '#f6f0e5' }}>
                {['รถตู้', 'เบาะ', 'ชื่อสมาชิก', 'โทรศัพท์', 'Passport', 'เวลาจอง', ''].map((label, index) => <th key={index} style={{ padding: 10, borderBottom: '1px solid ' + border }}>{label}</th>)}
              </tr></thead>
              <tbody>
                {(data.bookings || []).map(booking => <tr key={booking.id}>
                  <td style={{ padding: 10, borderBottom: '1px solid #eee6da' }}>คันที่ {booking.van_number}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #eee6da' }}>{booking.seat_number}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #eee6da' }}>{booking.member_name || 'สมาชิก'}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #eee6da', whiteSpace: 'nowrap' }}>{booking.phone || '—'}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #eee6da', whiteSpace: 'nowrap' }}>{booking.passport_status === 'yes' ? 'มี' : booking.passport_status === 'no' ? 'ไม่มี' : 'ยังไม่ระบุ'}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #eee6da', whiteSpace: 'nowrap' }}>{booking.created_at ? new Date(booking.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '—'}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid #eee6da' }}><button type="button" style={{ ...softButton, color: '#8b3f39' }} disabled={Boolean(working)} onClick={() => cancelBooking(booking)}>ยกเลิก</button></td>
                </tr>)}
                {!(data.bookings || []).length && <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#776c5c' }}>ยังไม่มีรายการจอง</td></tr>}
              </tbody>
            </table>
          </div>}
        </div>
      </section>}
    </>}

    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      {route !== 'event-home' && <button type="button" style={softButton} onClick={() => navigate('event-home')}>← เมนูเจ้าภาพงานกฐิน</button>}
      <button type="button" style={softButton} onClick={() => navigate('order-drink')}>☕ ไปหน้าเลือกออร์เดอร์เครื่องดื่ม</button>
    </div>
  </main>;
}
