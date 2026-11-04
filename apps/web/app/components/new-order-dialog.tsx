'use client';

import { FormEvent, MouseEvent, useEffect, useRef, useState } from 'react';
import { API, apiFetch } from '../lib/api';

type Client = { _id: string; name: string; phone: string };
type NewOrderDialogProps = {
  label: string;
  className: string;
  initialClient?: Client;
  onCreated?: () => void;
};

const blankOrder = { garmentType: '', deliveryDate: '' };
const blankClient = { name: '', phone: '' };

export function NewOrderDialog({
  label,
  className,
  initialClient,
  onCreated,
}: NewOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankOrder);
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
    setForm(blankOrder);
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
      setForm((current) => ({ ...current, garmentType: result.name }));
      setNewGarmentType('');
      setAddingGarmentType(false);
      setMessage(`Garment type “${result.name}” saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Garment type could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
        setClients((current) => [
          client,
          ...current.filter((item) => item._id !== client._id),
        ]);
      }
      if (!clientId) throw new Error('Select an existing client or add a new one.');

      const orderResponse = await apiFetch(`${API}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          garmentType: form.garmentType,
          deliveryDate: new Date(form.deliveryDate).toISOString(),
        }),
      });
      if (!orderResponse.ok) {
        const body = await orderResponse.json().catch(() => null);
        const details = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Could not save the order.';
        throw new Error(details);
      }

      reset();
      setOpen(false);
      setSuccess('Order created.');
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
                <button type="button" className={clientMode === 'existing' ? 'selected' : ''} onClick={() => { setClientMode('existing'); setMessage(''); }}>
                  Existing client
                </button>
                <button type="button" className={clientMode === 'new' ? 'selected' : ''} onClick={() => { setClientMode('new'); setSelectedClientId(''); setMessage(''); }}>
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
                      }}
                      placeholder="Filter by name or phone number"
                    />
                  </label>
                  <label>
                    Choose client
                    <select
                      value={selectedClientId}
                      required
                      onChange={(event) => setSelectedClientId(event.target.value)}
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

              <label>
                Garment type
                <select
                  value={addingGarmentType ? '__add_new__' : form.garmentType}
                  required
                  disabled={garmentTypesLoading}
                  onChange={(event) => {
                    if (event.target.value === '__add_new__') {
                      setAddingGarmentType(true);
                      setForm({ ...form, garmentType: '' });
                    } else {
                      setAddingGarmentType(false);
                      setForm({ ...form, garmentType: event.target.value });
                    }
                  }}
                >
                  <option value="">{garmentTypesLoading ? 'Loading garment types…' : 'Select a garment type'}</option>
                  {garmentTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                  <option value="__add_new__">＋ Add new garment type…</option>
                </select>
              </label>

              {addingGarmentType && (
                <div className="new-garment-type">
                  <label>
                    New garment type
                    <input
                      autoFocus
                      maxLength={80}
                      value={newGarmentType}
                      onChange={(event) => setNewGarmentType(event.target.value)}
                      placeholder="e.g. Bridal blouse"
                    />
                  </label>
                  <div className="garment-type-actions">
                    <button type="button" onClick={saveGarmentType} disabled={saving || !newGarmentType.trim()}>
                      {saving ? 'Saving…' : 'Save type'}
                    </button>
                    <button type="button" onClick={() => { setAddingGarmentType(false); setNewGarmentType(''); }} disabled={saving}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <label>
                Delivery date
                <input
                  type="date"
                  value={form.deliveryDate}
                  required
                  onChange={(event) => setForm({ ...form, deliveryDate: event.target.value })}
                />
              </label>

              {message && <p className="new-order-message" role="status">{message}</p>}
              <button
                className="primary"
                disabled={saving || addingGarmentType || !form.garmentType || (clientMode === 'existing' && !selectedClientId)}
              >
                {saving ? 'Saving…' : 'Create order'}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
