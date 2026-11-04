'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { SketchPad } from '../../components/sketch-pad';
import { API, apiFetch } from '../../lib/api';

const statuses = [
  ['new', 'New order'], ['measurements_pending', 'Measurements pending'], ['designing', 'Designing'],
  ['stitching', 'Stitching'], ['ready', 'Ready for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'],
];
type Measurement = { label: string; value: string; unit?: string };
type Order = {
  _id: string; garmentType: string; description?: string; deliveryDate: string; givenDate?: string; status: string;
  totalAmount?: number; advancePaid?: number; notes?: string; referenceLinks?: string[]; imageUrls?: string[]; sketchUrl?: string;
  measurements?: Measurement[]; clientId: { _id: string; name: string; phone: string; email?: string; address?: string; notes?: string };
};
const dateValue = (date?: string) => date ? new Date(date).toISOString().slice(0, 10) : '';
const mediaUrl = (value?: string) => {
  if (!value || value.startsWith('data:') || /^https?:\/\//i.test(value)) return value ?? '';
  return `${API.replace(/\/api\/?$/, '')}${value}`;
};

export default function OrderWorkspace() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState<Order | null>(null);
  const [newMeasurement, setNewMeasurement] = useState<Measurement>({ label: '', value: '', unit: 'inches' });
  const [reference, setReference] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const response = await apiFetch(`${API}/orders/${params.id}`, { cache: 'no-store' });
    if (response.ok) { const data = await response.json(); setOrder(data); setDraft(data); }
    else setNotice('This order could not be found.');
  };
  useEffect(() => { if (params.id) load(); }, [params.id]);
  const save = async (event?: FormEvent) => {
    event?.preventDefault(); if (!draft) return; setSaving(true); setNotice('');
    const payload = {
      garmentType: draft.garmentType, description: draft.description, givenDate: draft.givenDate || undefined,
      deliveryDate: draft.deliveryDate, status: draft.status, measurements: draft.measurements ?? [],
      referenceLinks: draft.referenceLinks ?? [], imageUrls: draft.imageUrls ?? [], sketchUrl: draft.sketchUrl ?? null, notes: draft.notes,
      ...(draft.totalAmount !== undefined ? { totalAmount: Number(draft.totalAmount) } : {}),
      ...(draft.advancePaid !== undefined ? { advancePaid: Number(draft.advancePaid) } : {}),
    };
    const response = await apiFetch(`${API}/orders/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) { setNotice('Changes saved.'); await load(); } else setNotice('Could not save the changes. Please check the fields.');
    setSaving(false);
  };
  const update = <K extends keyof Order>(key: K, value: Order[K]) => setDraft(current => current ? { ...current, [key]: value } : current);
  const addMeasurement = () => {
    if (!newMeasurement.label.trim() || !newMeasurement.value.trim()) return;
    update('measurements', [...(draft?.measurements ?? []), newMeasurement]); setNewMeasurement({ label: '', value: '', unit: 'inches' });
  };
  const addReference = () => { if (!reference.trim()) return; update('referenceLinks', [...(draft?.referenceLinks ?? []), reference.trim()]); setReference(''); };
  const compressPhoto = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('The photo could not be opened.'));
      image.onload = () => {
        const largestSide = 1440; const scale = Math.min(1, largestSide / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d'); if (!ctx) return reject(new Error('Photo processing is unavailable.'));
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/jpeg', 0.82);
        if (result.length > 1500000) return reject(new Error('One photo is still too large. Please choose a smaller image.'));
        resolve(result);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  const attachPhotos = async (files: FileList | null) => {
    if (!files) return;
    const available = 4 - (draft?.imageUrls?.length ?? 0); const selected = Array.from(files).filter(file => file.type.startsWith('image/')).slice(0, available);
    if (!selected.length) { setNotice('An order can contain up to four reference photos.'); return; }
    try {
      const photos = await Promise.all(selected.map(compressPhoto)); update('imageUrls', [...(draft?.imageUrls ?? []), ...photos]);
      setNotice(selected.length < files.length ? 'The first available photos were added.' : 'Photos added. Save the order to keep them.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not add those photos.'); }
  };
  if (!draft) return <main className="order-page"><p>{notice || 'Loading order…'}</p></main>;
  const balance = (Number(draft.totalAmount) || 0) - (Number(draft.advancePaid) || 0);
  return <main className="order-page">
    <Link className="back" href="/">← Back to dashboard</Link>
    <header className="order-header"><div><p className="eyebrow">ORDER WORKSPACE</p><h1>{draft.clientId.name}</h1><p><Link href={`/clients/${draft.clientId._id}`}>{draft.clientId.phone} · View client history</Link> · {draft.garmentType}</p></div><label className="status-label">WORK STATUS<select value={draft.status} onChange={e => update('status', e.target.value)}>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></header>
    <form onSubmit={save} className="workspace-grid">
      <section className="workspace-card details"><h2>Order details</h2><div className="two-col"><label>Garment type<input required value={draft.garmentType} onChange={e => update('garmentType', e.target.value)} /></label><label>Delivery date<input required type="date" value={dateValue(draft.deliveryDate)} onChange={e => update('deliveryDate', e.target.value)} /></label><label>Given date<input type="date" value={dateValue(draft.givenDate)} onChange={e => update('givenDate', e.target.value)} /></label><label>Order total (₹)<input type="number" min="0" value={draft.totalAmount ?? ''} onChange={e => update('totalAmount', e.target.value === '' ? undefined : Number(e.target.value))} /></label><label>Amount received (₹)<input type="number" min="0" value={draft.advancePaid ?? ''} onChange={e => update('advancePaid', e.target.value === '' ? undefined : Number(e.target.value))} /></label><div className="balance"><span>Balance</span><strong>₹{balance.toLocaleString('en-IN')}</strong></div></div><label>Description / design notes<textarea value={draft.description ?? ''} onChange={e => update('description', e.target.value)} placeholder="Fabric, colour, pattern, embroidery, fitting notes…" /></label><label>Internal notes<textarea value={draft.notes ?? ''} onChange={e => update('notes', e.target.value)} placeholder="Anything only the boutique needs to remember" /></label></section>
      <section className="workspace-card"><h2>Measurements</h2><p className="hint">Measurements belong to this order, so past fitting details stay safe.</p><div className="measurements">{(draft.measurements ?? []).length === 0 && <p className="empty">No measurements added yet.</p>}{(draft.measurements ?? []).map((item, index) => <div className="measurement" key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value} {item.unit}</strong><button type="button" aria-label={`Remove ${item.label}`} onClick={() => update('measurements', draft.measurements?.filter((_, i) => i !== index))}>×</button></div>)}</div><div className="measure-entry"><input value={newMeasurement.label} placeholder="e.g. Bust" onChange={e => setNewMeasurement({ ...newMeasurement, label: e.target.value })} /><input value={newMeasurement.value} placeholder="Value" onChange={e => setNewMeasurement({ ...newMeasurement, value: e.target.value })} /><button type="button" onClick={addMeasurement}>Add</button></div></section>
      <section className="workspace-card"><h2>Reference links</h2><p className="hint">Paste Pinterest, Instagram, Google Drive, or any image link shared by the client.</p><div className="links">{(draft.referenceLinks ?? []).map((link, index) => <div className="reference" key={link + index}><a href={link} target="_blank" rel="noreferrer">{link}</a><button type="button" aria-label="Remove reference" onClick={() => update('referenceLinks', draft.referenceLinks?.filter((_, i) => i !== index))}>×</button></div>)}</div><div className="link-entry"><input type="url" value={reference} placeholder="https://…" onChange={e => setReference(e.target.value)} /><button type="button" onClick={addReference}>Add link</button></div></section>
      <section className="workspace-card media-card"><h2>Reference photos</h2><p className="hint">Add up to four photos shared by the client. Photos are resized before saving and stored as files in the API uploads folder.</p><div className="photo-grid">{(draft.imageUrls ?? []).map((image, index) => <figure key={image.slice(-30) + index}><img src={mediaUrl(image)} crossOrigin="use-credentials" alt={`Client reference ${index + 1}`} /><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => update('imageUrls', draft.imageUrls?.filter((_, i) => i !== index))}>×</button></figure>)}<label className="upload-photo"><input type="file" accept="image/*" multiple onChange={event => { attachPhotos(event.target.files); event.currentTarget.value = ''; }} /><span>＋</span><strong>Add photos</strong><small>{draft.imageUrls?.length ?? 0}/4</small></label></div></section>
      <section className="workspace-card sketch-card"><h2>Model sketch</h2><p className="hint">Draw the garment model, style lines, or placement notes. Use a mouse, finger, or stylus.</p><SketchPad initialSketch={mediaUrl(draft.sketchUrl)} onChange={sketchUrl => update('sketchUrl', sketchUrl)} /></section>
      <footer className="save-bar"><p>{notice}</p><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save order'}</button></footer>
    </form>
    <style jsx>{`
      .order-page{max-width:1050px;margin:auto;padding:34px 28px 80px}.back{color:#665848;text-decoration:none;font-size:14px}.order-header{margin:28px 0;display:flex;justify-content:space-between;gap:20px;align-items:end}.order-header h1{font:700 38px 'Playfair Display';margin:7px 0}.order-header p:not(.eyebrow){color:#6f6961}.status-label{width:205px;font:500 10px 'DM Mono';letter-spacing:1px}.status-label select{margin-top:7px}.workspace-grid{display:grid;grid-template-columns:1.16fr .84fr;gap:16px}.workspace-card{background:#fff;border:1px solid #ebe5de;border-radius:16px;padding:25px}.workspace-card h2{font:700 24px 'Playfair Display';margin:0 0 5px}.details{grid-row:span 2}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px 0}.workspace-card label{margin-top:17px}.workspace-card textarea{resize:vertical;min-height:84px;width:100%;font:400 14px 'DM Sans';padding:11px 12px;border:1px solid #d9d2ca;border-radius:8px;background:#fffcf9}.balance{background:#f3f0ec;border-radius:8px;padding:10px 12px;display:grid;align-content:center}.balance span{font-size:12px;color:#6f6961}.balance strong{font:600 18px 'Playfair Display';margin-top:2px}.hint,.empty{font-size:13px;line-height:1.45;color:#756e65}.measurements,.links{margin:17px 0}.measurement{display:grid;grid-template-columns:1fr auto 24px;gap:8px;align-items:center;border-bottom:1px solid #eee9e3;padding:9px 0;font-size:14px}.measurement strong{font-family:'DM Mono';font-size:12px}.measurement button,.reference button{border:0;background:none;color:#9b5146;font-size:19px;cursor:pointer}.measure-entry,.link-entry{display:grid;grid-template-columns:1fr .7fr auto;gap:8px}.link-entry{grid-template-columns:1fr auto}.measure-entry button,.link-entry button{background:#e9dfce;border:0;border-radius:7px;padding:0 13px;font-weight:600;cursor:pointer}.reference{display:flex;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid #eee9e3}.reference a{font-size:13px;color:#665848;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.media-card,.sketch-card{grid-column:span 2}.photo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:17px}.photo-grid figure,.upload-photo{aspect-ratio:1;margin:0;border-radius:9px;overflow:hidden;position:relative;background:#f3f0ec}.photo-grid figure img{width:100%;height:100%;object-fit:cover}.photo-grid figure button{position:absolute;right:5px;top:5px;width:25px;height:25px;border:0;border-radius:50%;background:#fff;color:#9b5146;font-size:18px;line-height:1;cursor:pointer}.upload-photo{border:1px dashed #bcae9f;display:grid;place-content:center;text-align:center;gap:2px;color:#665848;cursor:pointer}.upload-photo input{display:none}.upload-photo span{font-size:27px;line-height:1;font-weight:300}.upload-photo strong{font-size:12px}.upload-photo small{font:10px 'DM Mono';color:#756e65}.save-bar{grid-column:span 2;background:#343930;border-radius:13px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center;color:#d9ddd2;min-height:64px}.save-bar p{font-size:13px}.save-bar .primary{margin:0;padding:10px 21px;background:#e9dfce;color:#39332d}@media(max-width:700px){.order-page{padding:24px 16px}.order-header{align-items:start;flex-direction:column}.workspace-grid{grid-template-columns:1fr}.details{grid-row:auto}.media-card,.sketch-card,.save-bar{grid-column:auto}.two-col{grid-template-columns:1fr}.status-label{width:100%}.photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
  </main>;
}
