'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { SketchPad } from '../../components/sketch-pad';
import { PaymentEntry } from '../../components/payment-entry';
import { API, apiFetch } from '../../lib/api';
import styles from './order-actions.module.css';

const statuses = [
  ['new', 'New order'], ['measurements_pending', 'Measurements pending'], ['designing', 'Designing'],
  ['stitching', 'Stitching'], ['ready', 'Ready for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'],
];
type Measurement = { label: string; value: string; unit?: string };
type Order = {
  _id: string; garmentType: string; description?: string; deliveryDate: string; givenDate?: string; status: string;
  totalAmount?: number; advancePaid?: number; paidAmount?: number; balanceAmount?: number; notes?: string; referenceLinks?: string[]; imageUrls?: string[]; sketchUrl?: string;
  measurements?: Measurement[]; clientId: { _id: string; name: string; phone: string; email?: string; address?: string; notes?: string };
};
type PaymentRecord = {
  _id: string;
  amount: number;
  method: string;
  reference?: string;
  receivedAt: string;
  notes?: string;
  allocations: Array<{ orderId: string; amount: number; reversals?: Array<{ amount: number; reason: string }> }>;
  unallocatedAmount: number;
};
const dateValue = (date?: string) => date ? new Date(date).toISOString().slice(0, 10) : '';
const mediaUrl = (value?: string) => {
  if (!value || value.startsWith('data:') || /^https?:\/\//i.test(value)) return value ?? '';
  return `${API.replace(/\/api\/?$/, '')}${value}`;
};

export default function OrderWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState<Order | null>(null);
  const [newMeasurement, setNewMeasurement] = useState<Measurement>({ label: '', value: '', unit: 'inches' });
  const [reference, setReference] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentError, setPaymentError] = useState('');
  const [paymentRefreshVersion, setPaymentRefreshVersion] = useState(0);
  const load = async () => {
    const response = await apiFetch(`${API}/orders/${params.id}`, { cache: 'no-store' });
    if (response.ok) { const data = await response.json(); setOrder(data); setDraft(data); }
    else setNotice('This order could not be found.');
  };
  useEffect(() => { if (params.id) load(); }, [params.id]);
  useEffect(() => {
    if (!params.id) return;
    const controller = new AbortController();
    setPaymentLoading(true);
    apiFetch(`${API}/orders/${params.id}/payments`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.message === 'string' ? body.message : 'Order payment history could not be loaded.');
        }
        setPayments((await response.json()) as PaymentRecord[]);
        setPaymentError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setPaymentError(cause instanceof Error ? cause.message : 'Order payment history could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPaymentLoading(false);
      });
    return () => controller.abort();
  }, [params.id, paymentRefreshVersion]);
  const save = async (event?: FormEvent) => {
    event?.preventDefault(); if (!draft) return; setSaving(true); setNotice('');
    const payload = {
      garmentType: draft.garmentType, description: draft.description, givenDate: draft.givenDate || undefined,
      deliveryDate: draft.deliveryDate, status: draft.status, measurements: draft.measurements ?? [],
      referenceLinks: draft.referenceLinks ?? [], imageUrls: draft.imageUrls ?? [], sketchUrl: draft.sketchUrl ?? null, notes: draft.notes,
      ...(draft.totalAmount !== undefined ? { totalAmount: Number(draft.totalAmount) } : {}),
      ...(draft.advancePaid !== undefined ? { advancePaid: Number(draft.advancePaid) } : {}),
    };
    try {
      const response = await apiFetch(`${API}/orders/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Could not save the changes. Please check the fields.';
        throw new Error(message);
      }
      setNotice('Changes saved.');
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };
  const changeStatus = async (status: string) => {
    if (!order || statusSaving || status === order.status) return;
    setStatusSaving(true);
    setNotice('');
    try {
      const response = await apiFetch(`${API}/orders/${order._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Could not save the work status.';
        throw new Error(message);
      }
      const updated = await response.json() as Order;
      const savedStatus = updated.status ?? status;
      setOrder(current => current ? { ...current, status: savedStatus } : current);
      setDraft(current => current ? { ...current, status: savedStatus } : current);
      setNotice('Work status updated.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not save the work status.');
    } finally {
      setStatusSaving(false);
    }
  };
  const deleteOrder = async () => {
    if (!order || !window.confirm(`Permanently delete the ${order.garmentType} order for ${order.clientId.name}? Its photos and sketch will also be removed.`)) return;
    setDeleting(true);
    setNotice('');
    try {
      const response = await apiFetch(`${API}/orders/${order._id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const details = Array.isArray(result?.message)
          ? result.message.join(' ')
          : typeof result?.message === 'string'
            ? result.message
            : 'Order could not be deleted.';
        throw new Error(details);
      }
      if (typeof result?.warning === 'string') window.alert(result.warning);
      router.replace('/orders');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Order could not be deleted.');
    } finally {
      setDeleting(false);
    }
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
  const paidAmount = draft.paidAmount ?? draft.advancePaid ?? 0;
  const balance = Math.max(0, (Number(draft.totalAmount) || 0) - paidAmount);
  return <main className="order-page">
    <Link className={styles.back} href="/">
      <span aria-hidden="true">←</span>
      Back to dashboard
    </Link>
    <header className="order-header">
      <div className={styles.orderHeaderInfo}>
        <p className="eyebrow">ORDER WORKSPACE</p>
        <h1 className={styles.garmentTitle}>{draft.garmentType}</h1>
        <div className={styles.customerMeta}>
          <span className={styles.customerLabel}>CUSTOMER</span>
          <Link className={styles.customerName} href={`/clients/${draft.clientId._id}`}>{draft.clientId.name}</Link>
          <span className={styles.metaDivider} aria-hidden="true">·</span>
          <a className={styles.customerPhone} href={`tel:${draft.clientId.phone}`}>{draft.clientId.phone}</a>
          <Link className={styles.customerHistory} href={`/clients/${draft.clientId._id}`}>View client history <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
      <div className={styles.actions}>
        <label className={styles.statusControl}>
          <span>WORK STATUS</span>
          <select className={styles.statusSelect} data-status={draft.status} value={draft.status} disabled={statusSaving || saving} onChange={e => changeStatus(e.target.value)}>
            {statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <small aria-live="polite">{statusSaving ? 'Saving status…' : 'Status saves automatically'}</small>
        </label>
        <button type="button" className={styles.deleteButton} onClick={deleteOrder} disabled={deleting || saving || statusSaving}>{deleting ? 'Deleting…' : 'Delete order'}</button>
      </div>
    </header>
    <form onSubmit={save} className="workspace-grid">
      <section className="workspace-card details"><h2>Order details</h2><div className="two-col"><label>Garment type<input required value={draft.garmentType} onChange={e => update('garmentType', e.target.value)} /></label><label>Delivery date<input required type="date" value={dateValue(draft.deliveryDate)} onChange={e => update('deliveryDate', e.target.value)} /></label><label>Given date<input type="date" value={dateValue(draft.givenDate)} onChange={e => update('givenDate', e.target.value)} /></label><label>Order total (₹)<input type="number" min="0" value={draft.totalAmount ?? ''} onChange={e => update('totalAmount', e.target.value === '' ? undefined : Number(e.target.value))} /></label><label>Amount received (₹)<input type="number" min="0" value={draft.advancePaid ?? ''} onChange={e => update('advancePaid', e.target.value === '' ? undefined : Number(e.target.value))} /></label><div className="balance"><span>Balance</span><strong>₹{balance.toLocaleString('en-IN')}</strong></div></div><label>Description / design notes<textarea value={draft.description ?? ''} onChange={e => update('description', e.target.value)} placeholder="Fabric, colour, pattern, embroidery, fitting notes…" /></label><label>Internal notes<textarea value={draft.notes ?? ''} onChange={e => update('notes', e.target.value)} placeholder="Anything only the boutique needs to remember" /></label></section>
      <section className="workspace-card"><h2>Measurements</h2><p className="hint">Measurements belong to this order, so past fitting details stay safe.</p><div className="measurements">{(draft.measurements ?? []).length === 0 && <p className="empty">No measurements added yet.</p>}{(draft.measurements ?? []).map((item, index) => <div className="measurement" key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value} {item.unit}</strong><button type="button" aria-label={`Remove ${item.label}`} onClick={() => update('measurements', draft.measurements?.filter((_, i) => i !== index))}>×</button></div>)}</div><div className="measure-entry"><input value={newMeasurement.label} placeholder="e.g. Bust" onChange={e => setNewMeasurement({ ...newMeasurement, label: e.target.value })} /><input value={newMeasurement.value} placeholder="Value" onChange={e => setNewMeasurement({ ...newMeasurement, value: e.target.value })} /><button type="button" onClick={addMeasurement}>Add</button></div></section>
      <section className="workspace-card"><h2>Reference links</h2><p className="hint">Paste Pinterest, Instagram, Google Drive, or any image link shared by the client.</p><div className="links">{(draft.referenceLinks ?? []).map((link, index) => <div className="reference" key={link + index}><a href={link} target="_blank" rel="noreferrer">{link}</a><button type="button" aria-label="Remove reference" onClick={() => update('referenceLinks', draft.referenceLinks?.filter((_, i) => i !== index))}>×</button></div>)}</div><div className="link-entry"><input type="url" value={reference} placeholder="https://…" onChange={e => setReference(e.target.value)} /><button type="button" onClick={addReference}>Add link</button></div></section>
      <section className="workspace-card media-card"><h2>Reference photos</h2><p className="hint">Add up to four photos shared by the client. Photos are resized before saving and stored as files in the API uploads folder.</p><div className="photo-grid">{(draft.imageUrls ?? []).map((image, index) => <figure key={image.slice(-30) + index}><img src={mediaUrl(image)} crossOrigin="use-credentials" alt={`Client reference ${index + 1}`} /><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => update('imageUrls', draft.imageUrls?.filter((_, i) => i !== index))}>×</button></figure>)}<label className="upload-photo"><input type="file" accept="image/*" multiple onChange={event => { attachPhotos(event.target.files); event.currentTarget.value = ''; }} /><span>＋</span><strong>Add photos</strong><small>{draft.imageUrls?.length ?? 0}/4</small></label></div></section>
      <section className="workspace-card sketch-card"><h2>Model sketch</h2><p className="hint">Draw the garment model, style lines, or placement notes. Use a mouse, finger, or stylus.</p><SketchPad initialSketch={mediaUrl(draft.sketchUrl)} onChange={sketchUrl => update('sketchUrl', sketchUrl)} /></section>
      <footer className="save-bar"><p>{notice}</p><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save order'}</button></footer>
    </form>
    <section className={styles.paymentHistory}>
      <header className={styles.paymentHeading}>
        <div><p className="eyebrow">PAYMENT LEDGER</p><h2>Order payments</h2></div>
        <Link href={`/clients/${draft.clientId._id}`}>View customer history →</Link>
      </header>
      <div className={styles.paymentEntry}>
        <PaymentEntry
          clientId={draft.clientId._id}
          fixedOrderId={draft._id}
          orders={[{
            _id: draft._id,
            garmentType: draft.garmentType,
            totalAmount: draft.totalAmount,
            paidAmount,
            balanceAmount: balance,
          }]}
          onSaved={() => {
            setPaymentRefreshVersion((version) => version + 1);
            void load();
          }}
        />
      </div>
      {paymentError && <p className={styles.paymentError} role="alert">{paymentError}</p>}
      {paymentLoading ? <p className={styles.paymentNotice}>Loading order payments…</p> :
        payments.length === 0 ? <p className={styles.paymentNotice}>No payment allocations recorded for this order.</p> :
          payments.map((payment) => (
            <article className={styles.paymentRecord} key={payment._id}>
              <div className={styles.paymentRecordHeading}>
                <strong>₹{payment.allocations.reduce((sum, allocation) => sum + allocation.amount - (allocation.reversals ?? []).reduce((total, reversal) => total + reversal.amount, 0), 0).toLocaleString('en-IN')}</strong>
                <span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(payment.receivedAt))} · {payment.method.replaceAll('_', ' ')}</span>
                {payment.reference && <span>Ref: {payment.reference}</span>}
              </div>
              {payment.notes && <p>{payment.notes}</p>}
              {payment.allocations.map((allocation, index) => (
                <p key={`${allocation.orderId}-${index}`}>
                  Allocated ₹{allocation.amount.toLocaleString('en-IN')}
                  {allocation.reversals?.map((reversal, reversalIndex) => (
                    <span key={reversalIndex}> · ₹{reversal.amount.toLocaleString('en-IN')} reversed ({reversal.reason})</span>
                  ))}
                </p>
              ))}
            </article>
          ))}
    </section>
    <style jsx>{`
      .order-page{max-width:1050px;margin:auto;padding:34px 28px 80px}.back{color:#665848;text-decoration:none;font-size:14px}.order-header{margin:28px 0;display:flex;justify-content:space-between;gap:20px;align-items:end}.order-header h1{font:700 38px 'Playfair Display';margin:7px 0}.order-header p:not(.eyebrow){color:#6f6961}.status-label{width:205px;font:500 10px 'DM Mono';letter-spacing:1px}.status-label select{margin-top:7px}.workspace-grid{display:grid;grid-template-columns:1.16fr .84fr;gap:16px}.workspace-card{background:#fff;border:1px solid #ebe5de;border-radius:16px;padding:25px}.workspace-card h2{font:700 24px 'Playfair Display';margin:0 0 5px}.details{grid-row:span 2}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px 0}.workspace-card label{margin-top:17px}.workspace-card textarea{resize:vertical;min-height:84px;width:100%;font:400 14px 'DM Sans';padding:11px 12px;border:1px solid #d9d2ca;border-radius:8px;background:#fffcf9}.balance{background:#f3f0ec;border-radius:8px;padding:10px 12px;display:grid;align-content:center}.balance span{font-size:12px;color:#6f6961}.balance strong{font:600 18px 'Playfair Display';margin-top:2px}.hint,.empty{font-size:13px;line-height:1.45;color:#756e65}.measurements,.links{margin:17px 0}.measurement{display:grid;grid-template-columns:1fr auto 24px;gap:8px;align-items:center;border-bottom:1px solid #eee9e3;padding:9px 0;font-size:14px}.measurement strong{font-family:'DM Mono';font-size:12px}.measurement button,.reference button{border:0;background:none;color:#9b5146;font-size:19px;cursor:pointer}.measure-entry,.link-entry{display:grid;grid-template-columns:1fr .7fr auto;gap:8px}.link-entry{grid-template-columns:1fr auto}.measure-entry button,.link-entry button{background:#e9dfce;border:0;border-radius:7px;padding:0 13px;font-weight:600;cursor:pointer}.reference{display:flex;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid #eee9e3}.reference a{font-size:13px;color:#665848;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.media-card,.sketch-card{grid-column:span 2}.photo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:17px}.photo-grid figure,.upload-photo{aspect-ratio:1;margin:0;border-radius:9px;overflow:hidden;position:relative;background:#f3f0ec}.photo-grid figure img{width:100%;height:100%;object-fit:cover}.photo-grid figure button{position:absolute;right:5px;top:5px;width:25px;height:25px;border:0;border-radius:50%;background:#fff;color:#9b5146;font-size:18px;line-height:1;cursor:pointer}.upload-photo{border:1px dashed #bcae9f;display:grid;place-content:center;text-align:center;gap:2px;color:#665848;cursor:pointer}.upload-photo input{display:none}.upload-photo span{font-size:27px;line-height:1;font-weight:300}.upload-photo strong{font-size:12px}.upload-photo small{font:10px 'DM Mono';color:#756e65}.save-bar{grid-column:span 2;background:#343930;border-radius:13px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center;color:#d9ddd2;min-height:64px}.save-bar p{font-size:13px}.save-bar .primary{margin:0;padding:10px 21px;background:#e9dfce;color:#39332d}@media(max-width:700px){.order-page{padding:24px 16px}.order-header{align-items:start;flex-direction:column}.workspace-grid{grid-template-columns:1fr}.details{grid-row:auto}.media-card,.sketch-card,.save-bar{grid-column:auto}.two-col{grid-template-columns:1fr}.status-label{width:100%}.photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
  </main>;
}
