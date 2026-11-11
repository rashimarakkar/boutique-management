'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { NewOrderDialog } from '../../components/new-order-dialog';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { API, apiFetch } from '../../lib/api';
import styles from '../clients.module.css';

type Order = {
  _id: string;
  garmentType: string;
  deliveryDate: string;
  status: string;
};
type Invoice = {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  status: string;
  total: number;
  paidAmount: number;
  balanceAmount: number;
};
type LegacyPayment = {
  _id: string;
  invoiceId?: string;
  amount: number;
  method: string;
  reference?: string;
  receivedAt: string;
  notes?: string;
  unallocatedAmount: number;
  allocations: Array<{
    orderId: string;
    amount: number;
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [legacyPayments, setLegacyPayments] = useState<LegacyPayment[]>([]);
  const [legacyPaymentError, setLegacyPaymentError] = useState('');
  const [legacyPaymentsLoading, setLegacyPaymentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
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
    setLegacyPaymentsLoading(true);
    apiFetch(`${API}/clients/${params.id}/payments`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.message === 'string' ? body.message : 'Earlier payment history could not be loaded.');
        }
        setLegacyPayments((await response.json()) as LegacyPayment[]);
        setLegacyPaymentError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setLegacyPaymentError(cause instanceof Error ? cause.message : 'Earlier payment history could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLegacyPaymentsLoading(false);
      });
    return () => controller.abort();
  }, [params.id, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setInvoicesLoading(true);
    apiFetch(`${API}/invoices/client/${params.id}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.message === 'string' ? body.message : 'Client invoices could not be loaded.');
        }
        setInvoices((await response.json()) as Invoice[]);
        setInvoiceError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setInvoiceError(cause instanceof Error ? cause.message : 'Client invoices could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setInvoicesLoading(false);
      });
    return () => controller.abort();
  }, [params.id, refreshVersion]);

  const startEditing = () => {
    if (!data) return;
    setEditName(data.client.name);
    setEditPhone(data.client.phone);
    setEditError('');
    setEditSuccess('');
    setEditing(true);
  };

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    setEditError('');
    setEditSuccess('');
    setSavingClient(true);
    try {
      const response = await apiFetch(`${API}/clients/${data.client._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Client details could not be updated.';
        throw new Error(message);
      }

      const updatedClient = await response.json() as ClientSummary['client'];
      setData((current) => current ? { ...current, client: { ...current.client, ...updatedClient } } : current);
      setEditing(false);
      setEditSuccess('Client details updated.');
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : 'Client details could not be updated.');
    } finally {
      setSavingClient(false);
    }
  };

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
    return <main className={styles.page}><Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: 'Client' }]} /><p className={styles.state}>{error}</p></main>;
  }
  if (!data) return <main className={styles.page}><Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: 'Client' }]} /><p className={styles.state}>Loading client…</p></main>;

  const { client, orders, summary } = data;
  const totalBilled = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalPaid = invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0);
  const totalDue = invoices.reduce((sum, invoice) => sum + invoice.balanceAmount, 0);
  const earlierPayments = legacyPayments.filter((payment) => !payment.invoiceId);
  return (
    <main className={styles.page}>
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: client.name }]} />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CLIENT ACCOUNT</p>
          <h1>{client.name}</h1>
          <p className={styles.subtitle}>
            {client.phone}{client.email ? ` · ${client.email}` : ''}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.editButton} onClick={startEditing}>Edit details</button>
          <Link href="/invoices" className={styles.newOrder}>+ Create invoice</Link>
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
      {editing && (
        <form className={styles.clientEditForm} onSubmit={saveClient}>
          <label>
            Customer name
            <input value={editName} onChange={(event) => setEditName(event.target.value)} minLength={2} maxLength={100} required />
          </label>
          <label>
            Mobile number
            <input type="tel" value={editPhone} onChange={(event) => setEditPhone(event.target.value)} minLength={7} maxLength={30} required />
          </label>
          {editError && <p className={styles.deleteError} role="alert">{editError}</p>}
          <div className={styles.editActions}>
            <button type="button" className={styles.cancelEditButton} disabled={savingClient} onClick={() => { setEditing(false); setEditError(''); }}>Cancel</button>
            <button type="submit" className={styles.editButton} disabled={savingClient || !editName.trim() || !editPhone.trim()}>
              {savingClient ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
      {editSuccess && <p className={styles.editSuccess} role="status">{editSuccess}</p>}
      {deleteError && <p className={styles.deleteError} role="alert">{deleteError}</p>}

      <section className={styles.metrics}>
        <article className={styles.metric}><span>Total orders</span><strong>{summary.totalOrders}</strong></article>
        <article className={styles.metric}><span>Invoices</span><strong>{invoices.length}</strong></article>
        <article className={styles.metric}><span>Invoice total paid</span><strong>{money(totalPaid)}</strong></article>
        <article className={`${styles.metric} ${styles.due}`}><span>Invoice balance due</span><strong>{money(totalDue)}</strong></article>
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
            {orders.map((order) => (
              <Link className={styles.order} href={`/orders/${order._id}`} key={order._id}>
                <span className={styles.orderMain}>
                  <strong>{order.garmentType}</strong>
                  <span>Delivery {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(order.deliveryDate))}</span>
                </span>
                <span className={styles.orderStatus}>{statusNames[order.status] ?? order.status.replaceAll('_', ' ')}</span>
                <span className={styles.arrow}>View →</span>
              </Link>
            ))}
          </div>}
      </section>

      <section className={`${styles.history} ${styles.paymentHistorySection}`}>
        <div className={styles.historyHeading}>
          <div><p className={styles.eyebrow}>SINGLE BILLING RECORD</p><h2>Invoices & payments</h2></div>
          <Link href="/invoices" className={styles.newOrder}>+ Create invoice</Link>
        </div>
        <div className={styles.paymentMetrics}>
          <div><span>Total invoiced</span><strong>{money(totalBilled)}</strong></div>
          <div><span>Paid on invoices</span><strong>{money(totalPaid)}</strong></div>
          <div><span>Invoice balance due</span><strong>{money(totalDue)}</strong></div>
        </div>
        {invoiceError && <p className={styles.paymentError} role="alert">{invoiceError}</p>}
        {invoicesLoading ? <p className={styles.state}>Loading invoices…</p> :
          invoices.length === 0 ? <p className={styles.state}>No invoices yet. Create an invoice to record this client’s billing and payments.</p> :
            <div className={styles.orderList}>
              {invoices.map((invoice) => (
                <Link className={styles.order} href={`/invoices/${invoice._id}`} key={invoice._id}>
                  <span className={styles.orderMain}>
                    <strong>{invoice.invoiceNumber}</strong>
                    <span>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(invoice.invoiceDate))}</span>
                  </span>
                  <span className={styles.orderStatus}>{invoice.status.toUpperCase()}</span>
                  <span className={styles.orderPayment}>
                    <strong>{money(invoice.total)} total</strong>
                    <span>{money(invoice.paidAmount)} paid · {money(invoice.balanceAmount)} due</span>
                  </span>
                  <span className={styles.arrow}>View →</span>
                </Link>
              ))}
            </div>}
      </section>

      <section className={`${styles.history} ${styles.paymentHistorySection}`}>
        <div className={styles.historyHeading}>
          <div><p className={styles.eyebrow}>READ-ONLY HISTORY</p><h2>Earlier order payments</h2></div>
          <span>{earlierPayments.length} receipts</span>
        </div>
        <p className={styles.state}>These receipts were recorded before invoice-only billing. They do not reduce invoice balances. Reconcile them before recording them on an invoice.</p>
        {legacyPaymentError && <p className={styles.paymentError} role="alert">{legacyPaymentError}</p>}
        {legacyPaymentsLoading ? <p className={styles.state}>Loading earlier payment history…</p> :
          earlierPayments.length === 0 ? <p className={styles.state}>No earlier order payments found.</p> :
            <div className={styles.orderList}>
              {earlierPayments.map((payment) => (
                <article className={styles.paymentRecord} key={payment._id}>
                  <div className={styles.paymentRecordHeader}>
                    <div>
                      <strong>{money(payment.amount)}</strong>
                      <span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(payment.receivedAt))} · {payment.method.replaceAll('_', ' ')}</span>
                    </div>
                    {payment.reference && <span>Ref: {payment.reference}</span>}
                  </div>
                  {payment.notes && <p>{payment.notes}</p>}
                  <div className={styles.paymentAllocations}>
                    {payment.allocations.map((allocation, index) => {
                      const reversed = (allocation.reversals ?? []).reduce((sum, item) => sum + item.amount, 0);
                      return <Link href={`/orders/${allocation.orderId}`} key={`${allocation.orderId}-${index}`}>
                        {money(allocation.amount - reversed)} allocated to order
                        {reversed > 0 ? ` · ${money(reversed)} reversed` : ''}
                      </Link>;
                    })}
                    {payment.unallocatedAmount > 0 && <span>{money(payment.unallocatedAmount)} unallocated</span>}
                  </div>
                </article>
              ))}
            </div>}
      </section>
    </main>
  );
}
