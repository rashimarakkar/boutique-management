'use client';

import { FormEvent, MouseEvent, useEffect, useRef, useState } from 'react';
import { API, apiFetch } from '../lib/api';

type Client = { _id: string; name: string; phone: string };
type OrderDraft = {
  key: string;
  garmentType: string;
  deliveryDate: string;
  totalAmount: string;
  allocation: string;
};
type NewOrderDialogProps = {
  label: string;
  className: string;
  initialClient?: Client;
  onCreated?: () => void;
};

const blankOrder = (): OrderDraft => ({
  key: `${Date.now()}-${Math.random()}`,
  garmentType: '',
  deliveryDate: '',
  totalAmount: '',
  allocation: '',
});
const blankClient = { name: '', phone: '' };

export function NewOrderDialog({
  label,
  className,
  initialClient,
  onCreated,
}: NewOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<OrderDraft[]>([blankOrder()]);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [allocationMode, setAllocationMode] = useState<'automatic' | 'manual'>('automatic');
  const [newGarmentTypeIndex, setNewGarmentTypeIndex] = useState<number | null>(null);
  const [createdOrderIds, setCreatedOrderIds] = useState<Record<string, string>>({});
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState('');
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientQuery, setClientQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientError, setClientError] = useState('');
  const [newClient, setNewClient] = useState(blankClient);
  const [garmentTypes, setGarmentTypes] = useState<string[]>([]);
  const [garmentTypesLoading, setGarmentTypesLoading] = useState(true);
  const [addingGarmentType, setAddingGarmentType] = useState(false);
  const [newGarmentType, setNewGarmentType] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const clientOptions = initialClient && !clients.some((client) => client._id === initialClient._id)
    ? [initialClient, ...clients]
    : clients;
  const firstInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const orderTotal = orders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
  const advance = Number(advanceAmount) || 0;
  const allocations = orders.map((order, index) => {
    if (allocationMode === 'manual') return Number(order.allocation) || 0;
    const preceding = orders.slice(0, index).reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
    return Math.max(0, Math.min(Number(order.totalAmount) || 0, advance - preceding));
  });
  const allocatedAmount = allocations.reduce((sum, amount) => sum + amount, 0);
  const unallocatedAmount = Math.max(0, advance - allocatedAmount);
  const updateOrder = (index: number, patch: Partial<OrderDraft>) => {
    setPaymentIdempotencyKey('');
    setOrders((current) => current.map((order, orderIndex) =>
      orderIndex === index ? { ...order, ...patch } : order,
    ));
  };

  useEffect(() => {
    apiFetch(`${API}/orders/garment-types`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Garment types could not be loaded.');
        setGarmentTypes((await response.json()) as string[]);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Garment types could not be loaded.');
      })
      .finally(() => setGarmentTypesLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setClientsLoading(true);
      setClientError('');
      try {
        const params = new URLSearchParams();
        if (clientQuery.trim()) params.set('q', clientQuery.trim());
        const response = await apiFetch(`${API}/clients?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Clients could not be loaded.');
        setClients((await response.json()) as Client[]);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setClientError(error instanceof Error ? error.message : 'Clients could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setClientsLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [clientQuery]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstInput.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus();
    };
  }, [open]);

  const reset = () => {
    setOrders([blankOrder()]);
    setCreatedOrderIds({});
    setPaymentIdempotencyKey('');
    setAdvanceAmount('');
    setAllocationMode('automatic');
    setNewGarmentTypeIndex(null);
    setClientMode('existing');
    setClientQuery('');
    setSelectedClientId('');
    setNewClient(blankClient);
    setAddingGarmentType(false);
    setNewGarmentType('');
  };

  const saveGarmentType = async () => {
    const name = newGarmentType.trim();
    if (!name) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await apiFetch(`${API}/orders/garment-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const details = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Garment type could not be saved.';
        throw new Error(details);
      }
      const result = (await response.json()) as { name: string };
      setGarmentTypes((current) =>
        [...new Set([...current, result.name])].sort((a, b) => a.localeCompare(b)),
      );
      if (newGarmentTypeIndex !== null) {
        updateOrder(newGarmentTypeIndex, { garmentType: result.name });
      }
      setNewGarmentType('');
      setAddingGarmentType(false);
      setNewGarmentTypeIndex(null);
      setMessage(`Garment type “${result.name}” saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Garment type could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (orders.some((order) => !order.garmentType || !order.deliveryDate)) {
      setMessage('Add a garment type and delivery date for every order.');
      return;
    }
    if (orders.some((order) => !Number.isInteger(Number(order.totalAmount) || 0) || Number(order.totalAmount) < 0)) {
      setMessage('Order totals must be whole, non-negative amounts.');
      return;
    }
    if (!Number.isInteger(advance) || advance < 0) {
      setMessage('The advance must be a whole, non-negative amount.');
      return;
    }
    if (allocations.some((amount) => !Number.isInteger(amount))) {
      setMessage('Allocations must be whole amounts.');
      return;
    }
    if (allocatedAmount > advance) {
      setMessage('Total allocations cannot exceed the advance received.');
      return;
    }
    if (allocations.some((amount, index) => amount > (Number(orders[index].totalAmount) || 0))) {
      setMessage('An order allocation cannot exceed that order’s stitching total.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      let clientId = selectedClientId;
      if (clientMode === 'new') {
        const clientResponse = await apiFetch(`${API}/clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClient),
        });
        if (!clientResponse.ok) {
          const body = await clientResponse.json().catch(() => null);
          const details = Array.isArray(body?.message)
            ? body.message.join(' ')
            : typeof body?.message === 'string'
              ? body.message
              : 'Please check the new client details.';
          throw new Error(details);
        }
        const client = (await clientResponse.json()) as Client;
        clientId = client._id;
        setSelectedClientId(clientId);
        setClientMode('existing');
        setClients((current) => [
          client,
          ...current.filter((item) => item._id !== client._id),
        ]);
      }
      if (!clientId) throw new Error('Select an existing client or add a new one.');

      const createdByKey = { ...createdOrderIds };
      const createdOrders: Array<{ _id: string }> = [];
      for (const order of orders) {
        const alreadyCreated = createdByKey[order.key];
        if (alreadyCreated) {
          createdOrders.push({ _id: alreadyCreated });
          continue;
        }
        const orderResponse = await apiFetch(`${API}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            garmentType: order.garmentType,
            deliveryDate: new Date(order.deliveryDate).toISOString(),
            ...(order.totalAmount !== '' ? { totalAmount: Number(order.totalAmount) } : {}),
          }),
        });
        if (!orderResponse.ok) {
          const body = await orderResponse.json().catch(() => null);
          const details = Array.isArray(body?.message)
            ? body.message.join(' ')
            : typeof body?.message === 'string'
              ? body.message
              : 'Could not save an order.';
          throw new Error(
            `${details}${createdOrders.length ? ` ${createdOrders.length} order(s) were already created; no combined payment was recorded.` : ''}`,
          );
        }
        const savedOrder = (await orderResponse.json()) as { _id: string };
        createdByKey[order.key] = savedOrder._id;
        setCreatedOrderIds(createdByKey);
        createdOrders.push(savedOrder);
      }

      if (advance > 0) {
        const idempotencyKey = paymentIdempotencyKey || crypto.randomUUID();
        setPaymentIdempotencyKey(idempotencyKey);
        const paymentResponse = await apiFetch(`${API}/clients/${clientId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: advance,
            idempotencyKey,
            allocations: createdOrders.flatMap((order, index) =>
              allocations[index] > 0
                ? [{ orderId: order._id, amount: allocations[index] }]
                : [],
            ),
          }),
        });
        if (!paymentResponse.ok) {
          const body = await paymentResponse.json().catch(() => null);
          const details = Array.isArray(body?.message)
            ? body.message.join(' ')
            : typeof body?.message === 'string'
              ? body.message
              : 'Orders were created, but the combined advance could not be recorded.';
          throw new Error(`${details} Please check the customer payment history before retrying.`);
        }
      }

      reset();
      setOpen(false);
      setSuccess(`${createdOrders.length} order${createdOrders.length === 1 ? '' : 's'} created${advance > 0 ? ' and advance recorded' : ''}.`);
      onCreated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !saving) setOpen(false);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        onClick={() => {
          setSuccess('');
          setMessage('');
          if (initialClient) {
            setPaymentIdempotencyKey('');
            setClientMode('existing');
            setClientQuery('');
            setSelectedClientId(initialClient._id);
          }
          setOpen(true);
        }}
      >
        {label}
      </button>
      {success && <span className="new-order-success" role="status">{success}</span>}
      {open && (
        <div className="new-order-backdrop" onMouseDown={closeFromBackdrop}>
          <section
            className="new-order-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-order-title"
            aria-describedby="new-order-description"
          >
            <header className="new-order-dialog-header">
              <div>
                <p className="eyebrow">QUICK ENTRY</p>
                <h2 id="new-order-title">Add a new order</h2>
                <p id="new-order-description">Choose a client and garment to get started.</p>
              </div>
              <button
                type="button"
                className="new-order-close"
                aria-label="Close new order dialog"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>

            <form onSubmit={submit} className="new-order-form">
              <div className="client-mode">
                <button type="button" className={clientMode === 'existing' ? 'selected' : ''} onClick={() => { setPaymentIdempotencyKey(''); setClientMode('existing'); setMessage(''); }}>
                  Existing client
                </button>
                <button type="button" className={clientMode === 'new' ? 'selected' : ''} onClick={() => { setPaymentIdempotencyKey(''); setClientMode('new'); setSelectedClientId(''); setMessage(''); }}>
                  New client
                </button>
              </div>

              {clientMode === 'existing' ? (
                <>
                  <label>
                    Search clients
                    <input
                      ref={firstInput}
                      value={clientQuery}
                      onChange={(event) => {
                        setClientQuery(event.target.value);
                        setSelectedClientId('');
                        setPaymentIdempotencyKey('');
                      }}
                      placeholder="Filter by name or phone number"
                    />
                  </label>
                  <label>
                    Choose client
                    <select
                      value={selectedClientId}
                      required
                      onChange={(event) => { setSelectedClientId(event.target.value); setPaymentIdempotencyKey(''); }}
                      disabled={clientsLoading || Boolean(clientError)}
                    >
                      <option value="">
                        {clientsLoading ? 'Loading clients…' : clientError ? 'Could not load clients' : clients.length ? 'Select a client' : 'No matching clients'}
                      </option>
                      {clientOptions.map((client) => (
                        <option value={client._id} key={client._id}>{client.name} · {client.phone}</option>
                      ))}
                    </select>
                  </label>
                  {clientError && <p className="new-order-error">{clientError}</p>}
                </>
              ) : (
                <>
                  <label>
                    Client name
                    <input
                      ref={firstInput}
                      value={newClient.name}
                      required
                      minLength={2}
                      onChange={(event) => setNewClient({ ...newClient, name: event.target.value })}
                      placeholder="e.g. Ananya Shah"
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      value={newClient.phone}
                      required
                      minLength={7}
                      inputMode="tel"
                      onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })}
                      placeholder="e.g. 98765 43210"
                    />
                  </label>
                </>
              )}

              <section className="visit-orders" aria-label="Orders in this visit">
                <div className="visit-orders-heading">
                  <div><h3>Stitching orders</h3><span>{orders.length} order{orders.length === 1 ? '' : 's'}</span></div>
                  <button type="button" onClick={() => { setPaymentIdempotencyKey(''); setOrders((current) => [...current, blankOrder()]); }}>＋ Add order</button>
                </div>
                {orders.map((order, index) => (
                  <article className="visit-order" key={order.key}>
                    <div className="visit-order-heading">
                      <strong>Order {index + 1}</strong>
                      {orders.length > 1 && <button type="button" aria-label={`Remove order ${index + 1}`} onClick={() => {
                        setPaymentIdempotencyKey('');
                        setOrders((current) => current.filter((_, itemIndex) => itemIndex !== index));
                        setAddingGarmentType(false);
                        setNewGarmentTypeIndex(null);
                      }}>Remove</button>}
                    </div>
                    <label>Garment type
                      <select value={newGarmentTypeIndex === index ? '__add_new__' : order.garmentType}
                        required disabled={garmentTypesLoading}
                        onChange={(event) => {
                          if (event.target.value === '__add_new__') {
                            setAddingGarmentType(true);
                            setNewGarmentTypeIndex(index);
                            updateOrder(index, { garmentType: '' });
                          } else {
                            setAddingGarmentType(false);
                            setNewGarmentTypeIndex(null);
                            updateOrder(index, { garmentType: event.target.value });
                          }
                        }}>
                        <option value="">{garmentTypesLoading ? 'Loading garment types…' : 'Select a garment type'}</option>
                        {garmentTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                        <option value="__add_new__">＋ Add new garment type…</option>
                      </select>
                    </label>
                    {addingGarmentType && newGarmentTypeIndex === index && (
                      <div className="new-garment-type">
                        <label>New garment type<input autoFocus maxLength={80} value={newGarmentType} onChange={(event) => setNewGarmentType(event.target.value)} placeholder="e.g. Bridal blouse" /></label>
                        <div className="garment-type-actions">
                          <button type="button" onClick={saveGarmentType} disabled={saving || !newGarmentType.trim()}>{saving ? 'Saving…' : 'Save type'}</button>
                          <button type="button" onClick={() => { setAddingGarmentType(false); setNewGarmentType(''); setNewGarmentTypeIndex(null); }} disabled={saving}>Cancel</button>
                        </div>
                      </div>
                    )}
                    <div className="visit-order-fields">
                      <label>Delivery date<input type="date" value={order.deliveryDate} required onChange={(event) => updateOrder(index, { deliveryDate: event.target.value })} /></label>
                      <label>Stitching total (₹)<input type="number" min="0" step="1" value={order.totalAmount} onChange={(event) => updateOrder(index, { totalAmount: event.target.value })} /></label>
                    </div>
                  </article>
                ))}
                <div className="visit-total"><span>Total stitching amount</span><strong>₹{orderTotal.toLocaleString('en-IN')}</strong></div>
              </section>

              <section className="visit-payment">
                <h3>Combined advance</h3>
                <label>Amount received (₹)<input type="number" min="0" step="1" value={advanceAmount} onChange={(event) => { setAdvanceAmount(event.target.value); setPaymentIdempotencyKey(''); }} placeholder="0" /></label>
                <div className="allocation-mode">
                  <button type="button" className={allocationMode === 'automatic' ? 'selected' : ''} onClick={() => { setAllocationMode('automatic'); setPaymentIdempotencyKey(''); }}>Allocate automatically</button>
                  <button type="button" className={allocationMode === 'manual' ? 'selected' : ''} onClick={() => { setAllocationMode('manual'); setPaymentIdempotencyKey(''); }}>Allocate manually</button>
                </div>
                {orders.map((order, index) => (
                  <div className="allocation-row" key={`allocation-${index}`}>
                    <span>Order {index + 1} · {order.garmentType || 'Select garment'}</span>
                    {allocationMode === 'manual'
                      ? <input aria-label={`Allocation for order ${index + 1}`} type="number" min="0" step="1" max={order.totalAmount || 0} value={order.allocation} onChange={(event) => updateOrder(index, { allocation: event.target.value })} />
                      : <strong>₹{allocations[index].toLocaleString('en-IN')}</strong>}
                    <small>Balance after payment: ₹{Math.max(0, (Number(order.totalAmount) || 0) - allocations[index]).toLocaleString('en-IN')}</small>
                  </div>
                ))}
                <div className="allocation-summary">
                  <span>Allocated <strong>₹{allocatedAmount.toLocaleString('en-IN')}</strong></span>
                  <span>Unallocated <strong>₹{unallocatedAmount.toLocaleString('en-IN')}</strong></span>
                </div>
                {allocatedAmount > advance && <p className="new-order-error" role="alert">Allocations cannot exceed the received amount.</p>}
              </section>

              {message && <p className="new-order-message" role="status">{message}</p>}
              <button
                className="primary"
                disabled={saving || addingGarmentType || orders.some((order) => !order.garmentType || !order.deliveryDate) || (clientMode === 'existing' && !selectedClientId) || allocatedAmount > advance}
              >
                {saving ? 'Saving visit…' : `Create ${orders.length > 1 ? `${orders.length} orders` : 'order'}${advance > 0 ? ' & record advance' : ''}`}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
