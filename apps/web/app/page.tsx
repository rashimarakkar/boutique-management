'use client';

import Link from 'next/link';
import { CSSProperties, useCallback, useEffect, useState } from 'react';
import { NewOrderDialog } from './components/new-order-dialog';
import { Breadcrumbs } from './components/breadcrumbs';
import { API, apiFetch } from './lib/api';
import styles from './dashboard.module.css';

type Summary = {
  pending: number;
  delivered: number;
  overdue: number;
  dueToday: number;
  invoices: number;
  accounts: {
    billed: number;
    received: number;
    pending: number;
    invoicesWithPending: number;
  };
  expenses: { total: number };
  cashProfit: number;
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
      </header>
      <Breadcrumbs items={[{ label: 'Dashboard' }]} />
      <section className="dashboard-intro">
        <h2>Hamiz Boutique</h2>
        <time dateTime={new Date().toISOString().slice(0, 10)}>
          {new Intl.DateTimeFormat('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date())}
        </time>
      </section>
      <section className="metrics">
        <Metric label="Pending work" value={summary?.pending} tone="sand" href="/orders?view=pending" />
        <Metric label="Due today" value={summary?.dueToday} tone="rose" href="/orders?view=due_today" />
        <Metric label="Overdue" value={summary?.overdue} tone="red" href="/orders?view=overdue" />
        <Metric label="Invoices" value={summary?.invoices} tone="sage" href="/invoices" />
        <Metric label="Delivered" value={summary?.delivered} tone="sage" href="/orders?view=delivered" />
      </section>
      <section className="accounts-section">
        <div className="section-heading">
          <div><p className="eyebrow">ACCOUNTS</p><h3>Money overview</h3></div>
          <Link className="payment-dues-link" href="/invoices">
            <span>View invoices</span><span className="payment-dues-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={`metrics accounts-metrics ${styles.accountsMetrics}`}>
          <MoneyMetric label="Total invoiced" value={summary?.accounts.billed} tone="sand" href="/invoices" />
          <MoneyMetric label="Paid on invoices" value={summary?.accounts.received} tone="sage" href="/invoices" />
          <MoneyMetric
            label={`Invoice balance pending${summary?.accounts.invoicesWithPending ? ` · ${summary.accounts.invoicesWithPending} invoices` : ''}`}
            value={summary?.accounts.pending}
            tone="rose"
            href="/invoices"
          />
          <MoneyMetric label="Total expenses" value={summary?.expenses.total} tone="rose" href="/expenses" />
          <MoneyMetric label="Net cash profit · all time" value={summary?.cashProfit} tone="sand" href="/expenses" />
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
        <article className="panel deadlines-panel">
          <div className="panel-heading deadlines-heading">
            <div><p className="eyebrow">UPCOMING DEADLINES</p><h3>What needs attention</h3></div>
            <Link className="text-button deadlines-link" href="/orders">View all orders <span aria-hidden="true">→</span></Link>
          </div>
          <div className="order-list deadlines-list">
            {summary === null ? <p className="deadlines-state">Loading upcoming orders…</p> :
              summary.upcoming.length === 0 ? <p className="deadlines-state">No upcoming deliveries yet. Add your first order on the left.</p> :
                summary.upcoming.map((order) => (
                  <Link className="order upcoming-order" href={`/orders/${order._id}`} key={order._id}>
                    <div className="avatar upcoming-avatar" aria-hidden="true">{order.clientId.name[0]?.toUpperCase() ?? '?'}</div>
                    <div className="upcoming-details">
                      <strong>{order.clientId.name}</strong>
                      <span><span className="upcoming-garment">{order.garmentType}</span><span className="upcoming-separator" aria-hidden="true">·</span><span className="upcoming-status">{order.status.replaceAll('_', ' ')}</span></span>
                    </div>
                    <time className="upcoming-date" dateTime={order.deliveryDate}>
                      {new Intl.DateTimeFormat('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(order.deliveryDate))}
                    </time>
                  </Link>
                ))}
          </div>
          <div className="next deadlines-hint">
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
  const formattedValue = value ?? '—';
  const valueStyle = {
    '--amount-length': String(formattedValue).length,
    '--label-length': label.length,
  } as CSSProperties;

  return (
    <Link href={href} className={`metric ${tone} ${styles.dashboardMetric}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <span>{label}</span><strong style={valueStyle}>{formattedValue}</strong>
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
  const formattedValue = value === undefined ? '—' : `₹${value.toLocaleString('en-IN')}`;
  const amountStyle = {
    '--amount-length': String(formattedValue).length,
    '--label-length': label.length,
  } as CSSProperties;

  return (
    <Link href={href} className={`metric ${tone} ${styles.dashboardMetric}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <span>{label}</span>
      <strong style={amountStyle}>{formattedValue}</strong>
    </Link>
  );
}
