'use client';

import { FormEvent, useMemo, useState } from 'react';
import { API, apiFetch } from '../lib/api';
import styles from './payment-entry.module.css';

export type PaymentOrderOption = {
  _id: string;
  garmentType: string;
  totalAmount?: number;
  paidAmount?: number;
  balanceAmount?: number;
};

type Props = {
  clientId: string;
  orders: PaymentOrderOption[];
  fixedOrderId?: string;
  onSaved?: () => void;
};

type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other';
const methods: Array<[PaymentMethod, string]> = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['bank_transfer', 'Bank transfer'],
  ['card', 'Card'],
  ['other', 'Other'],
];

export function PaymentEntry({ clientId, orders, fixedOrderId, onSaved }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>(() =>
    fixedOrderId ? { [fixedOrderId]: '' } : {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const receivedAmount = Number(amount) || 0;
  const allocatedAmount = useMemo(
    () => Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [allocations],
  );
  const unallocatedAmount = Math.max(0, receivedAmount - allocatedAmount);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!Number.isInteger(receivedAmount) || receivedAmount < 1) {
      setError('Enter a whole amount greater than zero.');
      return;
    }
    if (Object.values(allocations).some((value) => Number(value) > 0 && !Number.isInteger(Number(value)))) {
      setError('Allocations must be whole amounts.');
      return;
    }
    if (allocatedAmount > receivedAmount) {
      setError('Allocations cannot exceed the amount received.');
      return;
    }
    if (orders.some((order) => Number(allocations[order._id]) >
      (order.balanceAmount ?? Math.max(0, (order.totalAmount ?? 0) - (order.paidAmount ?? 0))))) {
      setError('An allocation cannot exceed an order’s outstanding balance.');
      return;
    }
    const requestKey = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(requestKey);
    const paymentAllocations = Object.entries(allocations)
      .filter(([, value]) => Number(value) > 0)
      .map(([orderId, value]) => ({ orderId, amount: Number(value) }));
    setSaving(true);
    try {
      const response = await apiFetch(`${API}/clients/${clientId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: receivedAmount,
          method,
          reference: reference.trim() || undefined,
          receivedAt: receivedAt ? new Date(`${receivedAt}T12:00:00`).toISOString() : undefined,
          notes: notes.trim() || undefined,
          idempotencyKey: requestKey,
          allocations: paymentAllocations,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Payment could not be recorded.';
        throw new Error(detail);
      }
      setAmount('');
      setReference('');
      setNotes('');
      setAllocations(fixedOrderId ? { [fixedOrderId]: '' } : {});
      setIdempotencyKey('');
      setSuccess(`Payment recorded. ${unallocatedAmount > 0 ? `Unallocated advance: ₹${unallocatedAmount.toLocaleString('en-IN')}.` : ''}`);
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.fields}>
        <label>Amount received (₹)<input type="number" min="1" step="1" required value={amount} onChange={(event) => { setAmount(event.target.value); setIdempotencyKey(''); }} /></label>
        <label>Payment method<select value={method} onChange={(event) => { setMethod(event.target.value as PaymentMethod); setIdempotencyKey(''); }}>{methods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Received date<input type="date" value={receivedAt} onChange={(event) => { setReceivedAt(event.target.value); setIdempotencyKey(''); }} /></label>
        <label>Reference<input value={reference} maxLength={200} onChange={(event) => { setReference(event.target.value); setIdempotencyKey(''); }} placeholder="Receipt or UPI reference" /></label>
      </div>
      {orders.length > 0 && (
        <div className={styles.allocations}>
          <h3>Allocate to orders <span>Optional</span></h3>
          {orders.map((order) => {
            const balance = order.balanceAmount ?? Math.max(0, (order.totalAmount ?? 0) - (order.paidAmount ?? 0));
            const locked = Boolean(fixedOrderId && fixedOrderId !== order._id);
            return (
              <label className={styles.allocation} key={order._id}>
                <span>{order.garmentType}<small>Outstanding ₹{balance.toLocaleString('en-IN')}</small></span>
                <input aria-label={`Amount allocated to ${order.garmentType}`} type="number" min="0" max={balance} step="1"
                  disabled={locked || balance <= 0} value={allocations[order._id] ?? ''}
                  onChange={(event) => { setAllocations((current) => ({ ...current, [order._id]: event.target.value })); setIdempotencyKey(''); }} />
              </label>
            );
          })}
          <div className={styles.totals}>
            <span>Allocated <strong>₹{allocatedAmount.toLocaleString('en-IN')}</strong></span>
            <span>Unallocated <strong>₹{unallocatedAmount.toLocaleString('en-IN')}</strong></span>
          </div>
        </div>
      )}
      <label className={styles.notes}>Notes<textarea value={notes} maxLength={1000} onChange={(event) => { setNotes(event.target.value); setIdempotencyKey(''); }} placeholder="Optional payment notes" /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {success && <p className={styles.success} role="status">{success}</p>}
      <button className={styles.submit} disabled={saving || allocatedAmount > receivedAmount}>
        {saving ? 'Recording payment…' : fixedOrderId ? 'Record order payment' : 'Record payment'}
      </button>
    </form>
  );
}

type ExistingAdvanceAllocationProps = {
  paymentId: string;
  availableAmount: number;
  orders: PaymentOrderOption[];
  onSaved?: () => void;
};

export function ExistingAdvanceAllocation({
  paymentId,
  availableAmount,
  orders,
  onSaved,
}: ExistingAdvanceAllocationProps) {
  const eligibleOrders = orders.filter(
    (order) => (order.balanceAmount ?? (order.totalAmount ?? 0) - (order.paidAmount ?? 0)) > 0,
  );
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const selectedOrder = eligibleOrders.find((order) => order._id === orderId);
  const orderBalance = selectedOrder
    ? selectedOrder.balanceAmount ?? (selectedOrder.totalAmount ?? 0) - (selectedOrder.paidAmount ?? 0)
    : 0;

  if (availableAmount <= 0 || eligibleOrders.length === 0) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const allocationAmount = Number(amount);
    if (!selectedOrder || !Number.isInteger(allocationAmount) || allocationAmount < 1) {
      setError('Choose an order and enter a whole amount greater than zero.');
      return;
    }
    if (allocationAmount > availableAmount || allocationAmount > orderBalance) {
      setError('The allocation cannot exceed the available advance or order balance.');
      return;
    }

    const requestKey = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(requestKey);
    setSaving(true);
    try {
      const response = await apiFetch(`${API}/payments/${paymentId}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: requestKey,
          allocations: [{ orderId, amount: allocationAmount }],
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Advance could not be allocated.';
        throw new Error(detail);
      }
      setAmount('');
      setIdempotencyKey('');
      setSuccess('Advance allocated to the selected order.');
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Advance could not be allocated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.fields}>
        <label>
          Allocate existing advance
          <select value={orderId} onChange={(event) => { setOrderId(event.target.value); setIdempotencyKey(''); }}>
            <option value="">Select an outstanding order</option>
            {eligibleOrders.map((order) => (
              <option value={order._id} key={order._id}>
                {order.garmentType} · due ₹{(order.balanceAmount ?? (order.totalAmount ?? 0) - (order.paidAmount ?? 0)).toLocaleString('en-IN')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Amount (₹) · available {money(availableAmount)}
          <input type="number" min="1" max={Math.min(availableAmount, orderBalance)} step="1" required
            value={amount} onChange={(event) => { setAmount(event.target.value); setIdempotencyKey(''); }} />
        </label>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {success && <p className={styles.success} role="status">{success}</p>}
      <button className={styles.submit} disabled={saving || !orderId || Number(amount) > Math.min(availableAmount, orderBalance)}>
        {saving ? 'Allocating…' : 'Allocate advance'}
      </button>
    </form>
  );
}

function money(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}
