'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewOrderDialog } from '../../components/new-order-dialog';
import { API, apiFetch } from '../../lib/api';
import styles from '../clients.module.css';

type Order = {
  _id: string;
  garmentType: string;
  deliveryDate: string;
  status: string;
  totalAmount?: number;
  advancePaid?: number;
};
type ClientSummary = {
  client: { _id: string; name: string; phone: string; email?: string; address?: string; notes?: string };
  orders: Order[];
  summary: {
    totalOrders: number;
    totalBilled: number;
    totalCollected: number;
    totalDue: number;
    statuses: Record<string, number>;
  };
};
const statusNames: Record<string, string> = {
  new: 'New',
  measurements_pending: 'Measurements pending',
  designing: 'Designing',
  stitching: 'Stitching',
  ready: 'Ready for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const money = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export default function ClientDetailsPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ClientSummary | null>(null);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API}/clients/${params.id}/summary`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Client details could not be loaded.');
        setData((await response.json()) as ClientSummary);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Client details could not be loaded.');
      });
    return () => controller.abort();
  }, [params.id, refreshVersion]);

  if (error) {
    return <main className={styles.page}><Link href="/clients" className={styles.back}>← Clients</Link><p className={styles.state}>{error}</p></main>;
  }
  if (!data) return <main className={styles.page}><p className={styles.state}>Loading client…</p></main>;

  const { client, orders, summary } = data;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/clients" className={styles.back}>← All clients</Link>
          <p className={styles.eyebrow}>CLIENT ACCOUNT</p>
          <h1>{client.name}</h1>
          <p className={styles.subtitle}>
            {client.phone}{client.email ? ` · ${client.email}` : ''}
          </p>
        </div>
        <NewOrderDialog
          label="+ New order"
          className={styles.newOrder}
          initialClient={client}
          onCreated={() => setRefreshVersion((version) => version + 1)}
        />
      </header>

      <section className={styles.metrics}>
        <article className={styles.metric}><span>Total orders</span><strong>{summary.totalOrders}</strong></article>
        <article className={styles.metric}><span>Total collected</span><strong>{money(summary.totalCollected)}</strong></article>
        <article className={`${styles.metric} ${styles.due}`}><span>Payment due</span><strong>{money(summary.totalDue)}</strong></article>
        <article className={styles.metric}><span>Total billed</span><strong>{money(summary.totalBilled)}</strong></article>
      </section>

      <section className={styles.statusSummary}>
        <h2>Order status</h2>
        <div className={styles.statusList}>
          {Object.entries(statusNames).map(([status, name]) => (
            <div className={styles.statusItem} key={status}>
              <span>{name}</span><strong>{summary.statuses[status] ?? 0}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.history}>
        <div className={styles.historyHeading}>
          <div><p className={styles.eyebrow}>ORDER HISTORY</p><h2>Previous orders</h2></div>
          <span>{orders.length} orders</span>
        </div>
        {orders.length === 0 ? <p className={styles.state}>No orders for this client yet.</p> :
          <div className={styles.orderList}>
            {orders.map((order) => {
              const balance = Math.max(0, (order.totalAmount ?? 0) - (order.advancePaid ?? 0));
              return (
                <Link className={styles.order} href={`/orders/${order._id}`} key={order._id}>
                  <span className={styles.orderMain}>
                    <strong>{order.garmentType}</strong>
                    <span>Delivery {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(order.deliveryDate))}</span>
                  </span>
                  <span className={styles.orderStatus}>{statusNames[order.status] ?? order.status.replaceAll('_', ' ')}</span>
                  <span className={styles.orderPayment}>
                    <strong>{money(order.advancePaid ?? 0)} collected</strong>
                    <span>{balance > 0 ? `${money(balance)} due` : 'No balance due'}</span>
                  </span>
                  <span className={styles.arrow}>View →</span>
                </Link>
              );
            })}
          </div>}
      </section>
    </main>
  );
}
