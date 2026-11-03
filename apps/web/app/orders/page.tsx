'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const filters = [
  ['all', 'All orders'], ['pending', 'Pending work'], ['due_today', 'Due today'], ['overdue', 'Overdue'],
  ['delivered', 'Delivered'], ['payment_due', 'Payment due'], ['received', 'Has payment'],
];
type Order = { _id: string; garmentType: string; deliveryDate: string; status: string; totalAmount?: number; advancePaid?: number; clientId: { name: string; phone: string } };
const labelForStatus = (status: string) => status.replaceAll('_', ' ');

export default function OrdersPage() {
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { const requestedView = new URLSearchParams(window.location.search).get('view'); if (requestedView) setView(requestedView); }, []);
  useEffect(() => {
    const params = new URLSearchParams(); if (view !== 'all') params.set('view', view); if (submittedSearch) params.set('q', submittedSearch);
    setOrders(null); setError('');
    fetch(`${API}/orders?${params.toString()}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(); setOrders(await response.json());
    }).catch(() => { setOrders([]); setError('Orders could not be loaded. Check that the API is running.'); });
  }, [view, submittedSearch]);
  const submit = (event: FormEvent) => { event.preventDefault(); setSubmittedSearch(search.trim()); };
  return <main className="orders-page">
    <header><div><Link className="back" href="/">← Dashboard</Link><p className="eyebrow">ORDER DIRECTORY</p><h1>View orders</h1></div><Link className="new-order" href="/">+ New order</Link></header>
    <section className="orders-controls"><form onSubmit={submit}><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search client, phone, or garment" /><button>Search</button></form><div className="filter-row">{filters.map(([value, label]) => <button type="button" key={value} className={view === value ? 'active' : ''} onClick={() => setView(value)}>{label}</button>)}</div></section>
    <section className="orders-list"><div className="list-heading"><span>Client & order</span><span>Delivery</span><span>Payment</span><span>Status</span></div>{orders === null ? <p className="state">Loading orders…</p> : error ? <p className="state error">{error}</p> : orders.length === 0 ? <p className="state">No orders match this view.</p> : orders.map(order => { const total = order.totalAmount ?? 0; const received = order.advancePaid ?? 0; const balance = Math.max(0, total - received); return <Link href={`/orders/${order._id}`} key={order._id} className="order-row"><div className="client"><div className="avatar">{order.clientId.name?.[0] ?? '?'}</div><div><strong>{order.clientId.name}</strong><span>{order.garmentType} · {order.clientId.phone}</span></div></div><time>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(order.deliveryDate))}</time><div className="payment"><strong>₹{received.toLocaleString('en-IN')}</strong><span>{total ? `of ₹${total.toLocaleString('en-IN')} · ₹${balance.toLocaleString('en-IN')} due` : 'Amount not added'}</span></div><span className={`status ${order.status}`}>{labelForStatus(order.status)}</span></Link>; })}</section>
    <style jsx>{`.orders-page{max-width:1120px;margin:auto;padding:34px 28px 72px}.orders-page header{display:flex;justify-content:space-between;align-items:end;margin-bottom:30px}.back{display:block;color:#665848;text-decoration:none;font-size:13px;margin-bottom:17px}.orders-page h1{font:700 39px 'Playfair Display';margin:7px 0 0}.new-order{background:#343930;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-size:14px}.orders-controls{background:#fff;border:1px solid #ebe5de;border-radius:15px;padding:16px;margin-bottom:18px}.orders-controls form{display:flex;gap:9px}.orders-controls input{flex:1}.orders-controls form button,.filter-row button{border:0;background:#e9dfce;border-radius:8px;padding:10px 15px;font:600 13px 'DM Sans';color:#463e35;cursor:pointer}.filter-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.filter-row button{background:#f3f0ec;padding:8px 12px}.filter-row .active{background:#343930;color:white}.orders-list{background:#fff;border:1px solid #ebe5de;border-radius:15px;overflow:hidden}.list-heading,.order-row{display:grid;grid-template-columns:1.5fr .8fr 1fr .7fr;gap:18px;align-items:center;padding:16px 20px}.list-heading{background:#f3f0ec;color:#756e65;font:500 10px 'DM Mono';letter-spacing:1px}.order-row{border-top:1px solid #eee9e3;text-decoration:none;color:inherit}.order-row:hover{background:#fffcf9}.client{display:flex;align-items:center;gap:10px}.avatar{width:36px;height:36px;border-radius:50%;background:#e8dbca;display:grid;place-items:center;font:600 16px 'Playfair Display';color:#665848}.client strong,.client span,.payment strong,.payment span{display:block}.client strong{font-size:14px}.client span,.payment span{font-size:12px;color:#776f67;margin-top:3px}.order-row time{font:500 12px 'DM Mono';color:#665848}.payment strong{font-size:14px}.status{text-transform:capitalize;border-radius:999px;padding:6px 9px;width:max-content;font-size:12px;background:#f3f0ec;color:#665848}.status.delivered,.status.ready{background:#d5ded0;color:#3f5d40}.status.stitching,.status.designing{background:#e9dfce}.status.new,.status.measurements_pending{background:#f1d8d5}.state{padding:40px 20px;text-align:center;color:#756e65}.error{color:#9b5146}@media(max-width:720px){.orders-page{padding:24px 16px}.orders-page h1{font-size:32px}.list-heading{display:none}.order-row{grid-template-columns:1fr auto;gap:12px;padding:15px}.order-row time{grid-column:2;grid-row:1}.payment{grid-column:1;grid-row:2}.status{grid-column:2;grid-row:2}.orders-controls form{flex-direction:column}.orders-controls form button{width:100%}.new-order{padding:9px 11px;font-size:12px}}`}</style>
  </main>;
}
