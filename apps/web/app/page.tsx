'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { NewOrderDialog } from './components/new-order-dialog';
import { API, apiFetch } from './lib/api';

type Summary = {
  pending: number;
  delivered: number;
  overdue: number;
  dueToday: number;
  accounts: {
    billed: number;
    received: number;
    pending: number;
    ordersWithPending: number;
  };
  upcoming: Array<{
    _id: string;
    garmentType: string;
    deliveryDate: string;
    status: string;
    clientId: { name: string; phone: string };
  }>;
};

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const load = useCallback(async () => {
    const response = await apiFetch(`${API}/dashboard`, { cache: 'no-store' });
    if (response.ok) setSummary((await response.json()) as Summary);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main>
      <header>
        <div className="brand-lockup">
          <Link href="/" aria-label="Hamiz Boutique home">
            <img src="/hamiz-logo.png" alt="Hamiz Boutique" />
          </Link>
          <div></div>
        </div>
        <Link className="text-button" href="/clients">View clients</Link>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">TODAY&apos;S OVERVIEW</p>
          <h2>Hamiz Boutique</h2>
          <p>Curated styles for every woman.</p>
        </div>
        <span className="date">
          {new Intl.DateTimeFormat('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date())}
        </span>
      </section>
      <section className="metrics">
        <Metric label="Pending work" value={summary?.pending} tone="sand" href="/orders?view=pending" />
        <Metric label="Due today" value={summary?.dueToday} tone="rose" href="/orders?view=due_today" />
        <Metric label="Overdue" value={summary?.overdue} tone="red" href="/orders?view=overdue" />
        <Metric label="Delivered" value={summary?.delivered} tone="sage" href="/orders?view=delivered" />
      </section>
      <section className="accounts-section">
        <div className="section-heading">
          <div><p className="eyebrow">ACCOUNTS</p><h3>Money overview</h3></div>
          <Link href="/orders?view=payment_due">View payment dues</Link>
        </div>
        <div className="metrics accounts-metrics">
          <MoneyMetric label="Total billed" value={summary?.accounts.billed} tone="sand" href="/orders" />
          <MoneyMetric label="Amount received" value={summary?.accounts.received} tone="sage" href="/orders?view=received" />
          <MoneyMetric
            label={`Payment pending${summary?.accounts.ordersWithPending ? ` · ${summary.accounts.ordersWithPending} orders` : ''}`}
            value={summary?.accounts.pending}
            tone="rose"
            href="/orders?view=payment_due"
          />
        </div>
      </section>
      <section className="grid">
        <article className="panel quick-entry-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">QUICK ENTRY</p><h3>Add a new order</h3></div>
          </div>
          <p>Choose an existing client or add a new one, then select the garment type and delivery date.</p>
          <NewOrderDialog label="Create order" className="primary" onCreated={load} />
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">UPCOMING DEADLINES</p><h3>What needs attention</h3></div>
            <Link className="text-button" href="/orders">View all orders</Link>
          </div>
          <div className="order-list">
            {summary === null ? <p>Loading orders…</p> :
              summary.upcoming.length === 0 ? <p>No upcoming deliveries yet. Add your first order on the left.</p> :
                summary.upcoming.map((order) => (
                  <Link className="order" href={`/orders/${order._id}`} key={order._id}>
                    <div className="avatar">{order.clientId.name[0]}</div>
                    <div>
                      <strong>{order.clientId.name}</strong>
                      <span>{order.garmentType} · {order.status.replace('_', ' ')}</span>
                    </div>
                    <time>
                      {new Intl.DateTimeFormat('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(order.deliveryDate))}
                    </time>
                  </Link>
                ))}
          </div>
          <div className="next">
            <h4>Open an order</h4>
            <p>Add measurements, payment details, design notes, and reference links from its workspace.</p>
          </div>
        </article>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value?: number;
  tone: string;
  href: string;
}) {
  return (
    <Link href={href} className={`metric ${tone}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <span>{label}</span><strong>{value ?? '—'}</strong>
    </Link>
  );
}

function MoneyMetric({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value?: number;
  tone: string;
  href: string;
}) {
  return (
    <Link href={href} className={`metric ${tone}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <span>{label}</span>
      <strong>{value === undefined ? '—' : `₹${value.toLocaleString('en-IN')}`}</strong>
    </Link>
  );
}
