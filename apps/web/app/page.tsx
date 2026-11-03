'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type Summary = { pending: number; delivered: number; overdue: number; dueToday: number; accounts: { billed: number; received: number; pending: number; ordersWithPending: number }; upcoming: Array<{ _id: string; garmentType: string; deliveryDate: string; status: string; clientId: { name: string; phone: string } }> };
const blank = { name: '', phone: '', garmentType: '', deliveryDate: '' };

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => { const response = await fetch(`${API}/dashboard`, { cache: 'no-store' }); if (response.ok) setSummary(await response.json()); };
  useEffect(() => { load(); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const clientResponse = await fetch(`${API}/clients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, phone: form.phone }) });
      if (!clientResponse.ok) throw new Error('Please check the client details.');
      const client = await clientResponse.json();
      const orderResponse = await fetch(`${API}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client._id, garmentType: form.garmentType, deliveryDate: new Date(form.deliveryDate).toISOString() }) });
      if (!orderResponse.ok) throw new Error('Could not save the order.');
      setForm(blank); setMessage('Order saved. Open it from the list to add measurements and design details.'); load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong.'); }
    finally { setSaving(false); }
  };
  return <main>
    <header><div className="brand-lockup"><img src="/hamiz-logo.png" alt="Hamiz Boutique" /><div><p className="eyebrow">PRIVATE BOUTIQUE WORKSPACE</p><h1>Hamiz Boutique</h1></div></div><button className="profile">Owner</button></header>
    <section className="hero"><div><p className="eyebrow">TODAY&apos;S OVERVIEW</p><h2>Your orders, beautifully in hand.</h2><p>Keep every client, fit, design reference and deadline together.</p></div><span className="date">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span></section>
    <section className="metrics">
      <Metric label="Pending work" value={summary?.pending} tone="sand" href="/orders?view=pending" />
      <Metric label="Due today" value={summary?.dueToday} tone="rose" href="/orders?view=due_today" />
      <Metric label="Overdue" value={summary?.overdue} tone="red" href="/orders?view=overdue" />
      <Metric label="Delivered" value={summary?.delivered} tone="sage" href="/orders?view=delivered" />
    </section>
    <section className="accounts-section"><div className="section-heading"><div><p className="eyebrow">ACCOUNTS</p><h3>Money overview</h3></div><Link href="/orders?view=payment_due">View payment dues</Link></div><div className="metrics accounts-metrics"><MoneyMetric label="Total billed" value={summary?.accounts.billed} tone="sand" href="/orders" /><MoneyMetric label="Amount received" value={summary?.accounts.received} tone="sage" href="/orders?view=received" /><MoneyMetric label={`Payment pending${summary?.accounts.ordersWithPending ? ` · ${summary.accounts.ordersWithPending} orders` : ''}`} value={summary?.accounts.pending} tone="rose" href="/orders?view=payment_due" /></div></section>
    <section className="grid">
      <article className="panel"><div className="panel-heading"><div><p className="eyebrow">QUICK ENTRY</p><h3>Add a new order</h3></div></div>
        <form onSubmit={submit}><label>Client name<input value={form.name} required minLength={2} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ananya Shah" /></label><label>Phone number<input value={form.phone} required minLength={7} inputMode="tel" onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 98765 43210" /></label><label>Garment type<input value={form.garmentType} required onChange={e => setForm({ ...form, garmentType: e.target.value })} placeholder="e.g. Bridal blouse" /></label><label>Delivery date<input value={form.deliveryDate} required type="date" onChange={e => setForm({ ...form, deliveryDate: e.target.value })} /></label><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Create order'}</button>{message && <p className="message">{message}</p>}</form>
      </article>
      <article className="panel"><div className="panel-heading"><div><p className="eyebrow">UPCOMING DEADLINES</p><h3>What needs attention</h3></div><Link className="text-button" href="/orders">View all orders</Link></div>
        <div className="order-list">{summary === null ? <p>Loading orders…</p> : summary.upcoming.length === 0 ? <p>No upcoming deliveries yet. Add your first order on the left.</p> : summary.upcoming.map(order => <a className="order" href={`/orders/${order._id}`} key={order._id}><div className="avatar">{order.clientId.name[0]}</div><div><strong>{order.clientId.name}</strong><span>{order.garmentType} · {order.status.replace('_', ' ')}</span></div><time>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(order.deliveryDate))}</time></a>)}</div>
        <div className="next"><h4>Open an order</h4><p>Add measurements, payment details, design notes, and reference links from its workspace.</p></div>
      </article>
    </section>
  </main>;
}
function Metric({ label, value, tone, href }: { label: string; value?: number; tone: string; href: string }) { return <Link href={href} className={`metric ${tone}`} style={{ textDecoration: 'none', color: 'inherit' }}><span>{label}</span><strong>{value ?? '—'}</strong></Link>; }
function MoneyMetric({ label, value, tone, href }: { label: string; value?: number; tone: string; href: string }) { return <Link href={href} className={`metric ${tone}`} style={{ textDecoration: 'none', color: 'inherit' }}><span>{label}</span><strong>{value === undefined ? '—' : `₹${value.toLocaleString('en-IN')}`}</strong></Link>; }
