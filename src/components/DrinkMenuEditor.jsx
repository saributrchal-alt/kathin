import React, { useRef, useState } from 'react';

async function request(action, values) {
  const response = await fetch('/api/kathin-drinks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...values }) });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.message || 'บันทึกไม่สำเร็จ');
  return body;
}
async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('เลือกรูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 20 MB');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL('image/jpeg', .82);
    if (encoded.length > 2800000) throw new Error('รูปยังมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง');
    return encoded;
  } finally { bitmap.close(); }
}

export default function DrinkMenuEditor({ item, onSaved, onCancel }) {
  const [form, setForm] = useState({ name_th: '', name_en: '', description: '', category: 'drip', image_url: '', sort_order: 100, active: true, ...item, preparations: item?.preparations || (item?.category === 'blended' ? ['blended'] : ['hot']) });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const upload = async (file) => {
    if (!file) return;
    setBusy('upload'); setError('');
    try { const image = await prepareImage(file); const result = await request('menu-image', { image }); update('image_url', result.imageUrl); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  const save = async (event) => {
    event.preventDefault(); if (!form.preparations.length) { setError('เลือกอย่างน้อยหนึ่งรูปแบบ: ร้อน เย็น หรือปั่น'); return; } setBusy('save'); setError('');
    try { await request('menu-save', { ...form, menuId: item?.id || '', sort_order: Number(form.sort_order) }); await onSaved(); }
    catch (e) { setError(/description|image_url|preparations|schema cache/.test(e.message) ? 'กรุณารัน SQL เพิ่มรายละเอียดและรูปเมนูก่อน แล้วบันทึกอีกครั้ง' : e.message); }
    finally { setBusy(''); }
  };
  return <form className="drink-editor" onSubmit={save}>
    <h3>{item?.id ? 'แก้ไขเมนูเครื่องดื่ม' : 'เพิ่มเมนูเครื่องดื่ม'}</h3>
    {error && <p role="alert" className="drink-error">{error}</p>}
    <fieldset disabled={Boolean(busy)}>
      <div className="drink-editor-grid">
        <div>
          <div className="drink-editor-photo">{form.image_url ? <img src={form.image_url} alt="รูปเมนูที่เลือก" /> : <span aria-hidden="true">☕</span>}</div>
          <label className="drink-upload">{busy === 'upload' ? 'กำลังย่อและอัปโหลดรูป…' : 'เลือกรูป / ถ่ายภาพ'}<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} /></label>
          <small>ย่อรูปให้อัตโนมัติ · JPEG, PNG, WebP</small>
          {form.image_url && <button type="button" className="drink-secondary" onClick={() => update('image_url', '')}>นำรูปออกจากเมนู</button>}
        </div>
        <div className="drink-fields">
          <label>ชื่อเมนูภาษาไทย *<input required maxLength={100} value={form.name_th} onChange={(e) => update('name_th', e.target.value)} /></label>
          <label>ชื่อเมนูภาษาอังกฤษ<input maxLength={100} value={form.name_en} onChange={(e) => update('name_en', e.target.value)} /></label>
          <label>รายละเอียด<textarea rows={3} maxLength={500} placeholder="เช่น กาแฟดริปหอมละมุน ไม่เติมน้ำตาล" value={form.description || ''} onChange={(e) => update('description', e.target.value)} /></label>
          <label>ประเภท<select value={form.category} onChange={(e) => update('category', e.target.value)}><option value="drip">ดริป / ชง</option><option value="blended">ปั่น</option></select></label>
          <div><strong>รูปแบบที่ให้เลือก *</strong>{[['hot', 'ร้อน'], ['iced', 'เย็น'], ['blended', 'ปั่น']].map(([value, label]) => <label className="drink-checkbox" key={value}><input type="checkbox" checked={form.preparations.includes(value)} onChange={(e) => update('preparations', e.target.checked ? [...form.preparations, value] : form.preparations.filter((p) => p !== value))} />{label}</label>)}</div>
          <label>ลำดับแสดง<input type="number" required min="0" max="9999" value={form.sort_order} onChange={(e) => update('sort_order', e.target.value)} /></label>
          <label className="drink-checkbox"><input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} /> เปิดให้สมาชิกสั่งเมนูนี้</label>
        </div>
      </div>
      <div className="drink-editor-actions"><button className="drink-primary" type="submit">{busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกเมนู'}</button><button className="drink-secondary" type="button" onClick={onCancel}>ยกเลิก</button></div>
    </fieldset>
  </form>;
}
