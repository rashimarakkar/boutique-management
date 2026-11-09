'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewOrderDialog } from '../../components/new-order-dialog';
import { ExistingAdvanceAllocation, PaymentEntry } from '../../components/payment-entry';
import { API, apiFetch } from '../../lib/api';
import styles from '../clients.module.css';

type Order = {
  _id: string;
  garmentType: string;
  deliveryDate: string;
  status: string;
  totalAmount?: number;
  advancePaid?: number;
  paidAmount?: number;
  balanceAmount?: number;
};
type Payment = {
  _id: string;
  amount: number;
  method: string;
  reference?: string;
  receivedAt: string;
  notes?: string;
  unallocatedAmount: number;
  allocations: Array<{
    orderId: string;
    amount: number;
    notes?: string;
    reversals?: Array<{ amount: number; reason: string }>;
  }>;
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
  const router = useRouter();
  const [data, setData] = useState<ClientSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentError, setPaymentError] = useState('');
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
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

  useEffect(() => {
    const controller = new AbortController();
    setPaymentsLoading(true);
    apiFetch(`${API}/clients/${params.id}/payments`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.message === 'string' ? body.message : 'Payment history could not be loaded.');
        }
        setPayments((await response.json()) as Payment[]);
        setPaymentError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setPaymentError(cause instanceof Error ? cause.message : 'Payment history could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPaymentsLoading(false);
      });
    return () => controller.abort();
  }, [params.id, refreshVersion]);

  const deleteClient = async () => {
    if (!data || !window.confirm(`Delete client ${data.client.name}? This cannot be undone.`)) return;
    setDeleteError('');
    setDeleting(true);
    try {
      const response = await apiFetch(`${API}/clients/${data.client._id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const details = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Client could not be deleted.';
        throw new Error(details);
      }
      router.replace('/clients');
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Client could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return <main className={styles.page}><Link href="/clients" className={styles.back}>← Clients</Link><p className={styles.state}>{error}</p></main>;
  }
  if (!data) return <main className={styles.page}><p className={styles.state}>Loading client…</p></main>;

  const { client, orders, summary } = data;
  const totalPaymentsReceived = payments.reduce((sum, payment) => sum + payment.amount, 0);
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
        <div className={styles.headerActions}>
          <button type="button" className={styles.deleteButton} onClick={deleteClient} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete client'}
          </button>
          <NewOrderDialog
            label="+ New order"
            className={styles.newOrder}
            initialClient={client}
            onCreated={() => setRefreshVersion((version) => version + 1)}
          />
        </div>
      </header>
      {deleteError && <p className={styles.deleteError} role="alert">{deleteError}</p>}

      <section className={styles.metrics}>
        <article className={styles.metric}><span>Total orders</span><strong>{summary.totalOrders}</strong></article>
        <article className={styles.metric}><span>Total paid</span><strong>{money(totalPaymentsReceived)}</strong></article>
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
              const balance = order.balanceAmount ?? Math.max(0, (order.totalAmount ?? 0) - (order.paidAmount ?? order.advancePaid ?? 0));
              return (
                <Link className={styles.order} href={`/orders/${order._id}`} key={order._id}>
                  <span className={styles.orderMain}>
                    <strong>{order.garmentType}</strong>
                    <span>Delivery {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(order.deliveryDate))}</span>
                  </span>
                  <span className={styles.orderStatus}>{statusNames[order.status] ?? order.status.replaceAll('_', ' ')}</span>
                  <span className={styles.orderPayment}>
                    <strong>{money(order.paidAmount ?? order.advancePaid ?? 0)} collected</strong>
                    <span>{balance > 0 ? `${money(balance)} due` : 'No balance due'}</span>
                  </span>
                  <span className={styles.arrow}>View →</span>
                </Link>
              );
            })}
          </div>}
      </section>

      <section className={`${styles.history} ${styles.paymentHistorySection}`}>
        <div className={styles.historyHeading}>
          <div><p className={styles.eyebrow}>CUSTOMER LEDGER</p><h2>Payments & advances</h2></div>
          <span>{payments.length} receipts</span>
        </div>
        <div className={styles.paymentMetrics}>
          <div><span>Total stitching amount</span><strong>{money(summary.totalBilled)}</strong></div>
          <div><span>Total amount paid</span><strong>{money(totalPaymentsReceived)}</strong></div>
          <div><span>Total outstanding</span><strong>{money(summary.totalDue)}</strong></div>
          <div><span>Unallocated advance</span><strong>{money(payments.reduce((sum, payment) => sum + (payment.unallocatedAmount ?? 0), 0))}</strong></div>
        </div>
        <div className={styles.paymentEntry}>
          <h3>Record a customer payment</h3>
          <p>Allocate part or all of a receipt to this customer’s outstanding orders, or leave it as an advance.</p>
          <PaymentEntry
            clientId={client._id}
            orders={orders.map((order) => ({
              _id: order._id,
              garmentType: order.garmentType,
              totalAmount: order.totalAmount,
              paidAmount: order.paidAmount ?? order.advancePaid,
              balanceAmount: order.balanceAmount,
            }))}
            onSaved={() => setRefreshVersion((version) => version + 1)}
          />
        </div>
        <div className={styles.paymentHistory}>
          <h3>Payment history</h3>
          {paymentError && <p className={styles.paymentError} role="alert">{paymentError}</p>}
          {paymentsLoading ? <p className={styles.state}>Loading payment history…</p> :
            payments.length === 0 ? <p className={styles.state}>No payments recorded for this customer yet.</p> :
              payments.map((payment) => (
                <article className={styles.paymentRecord} key={payment._id}>
                  <div className={styles.paymentRecordHeader}>
                    <div><strong>{money(payment.amount)}</strong><span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(payment.receivedAt))} · {payment.method.replaceAll('_', ' ')}</span></div>
                    {payment.reference && <span>Ref: {payment.reference}</span>}
                  </div>
                  {payment.notes && <p>{payment.notes}</p>}
                  {payment.unallocatedAmount > 0 && (
                    <ExistingAdvanceAllocation
                      paymentId={payment._id}
                      availableAmount={payment.unallocatedAmount}
                      orders={orders.map((order) => ({
                        _id: order._id,
                        garmentType: order.garmentType,
                        totalAmount: order.totalAmount,
                        paidAmount: order.paidAmount ?? order.advancePaid,
                        balanceAmount: order.balanceAmount,
                      }))}
                      onSaved={() => setRefreshVersion((version) => version + 1)}
                    />
                  )}
                  <div className={styles.paymentAllocations}>
                    {payment.allocations.map((allocation, index) => {
                      const order = orders.find((item) => item._id === allocation.orderId);
                      const reversed = (allocation.reversals ?? []).reduce((sum, item) => sum + item.amount, 0);
                      return <Link href={`/orders/${allocation.orderId}`} key={`${allocation.orderId}-${index}`}>
                        {order?.garmentType ?? 'Stitching order'} · {money(allocation.amount - reversed)} allocated
                        {reversed > 0 ? ` (${money(reversed)} reversed)` : ''}
                      </Link>;
                    })}
                    {payment.unallocatedAmount > 0 && <span>{money(payment.unallocatedAmount)} unallocated</span>}
                  </div>
                </article>
              ))}
        </div>
      </section>
    </main>
  );
}
