'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API, apiFetch } from '../lib/api';
import { Breadcrumbs } from '../components/breadcrumbs';
import { GarmentTypeInput } from '../components/garment-type-input';
import { useGarmentTypes } from '../components/use-garment-types';
import styles from './invoices.module.css';

type Client = {
  _id: string;
  name: string;
  phone: string;
  email?: string;
};

type InvoiceDraftItem = {
  orderId?: string;
  garmentType: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type ClientOrder = {
  _id: string;
  garmentType: string;
  totalAmount?: number;
};

type InvoiceItem = {
  orderId?: string;
  garmentType: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type InvoiceSummary = {
  orders: ClientOrder[];
};
type ClientInvoice = {
  invoiceNumber: string;
  items: InvoiceItem[];
};

type Invoice = {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  status: string;
  total: number;
  balanceAmount: number;
  clientId?: {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  items: InvoiceItem[];
};
type InvoicePage = {
  data: Invoice[];
  total: number;
  skip: number;
  limit: number;
  summary: {
    totalInvoices: number;
    dueAmount: number;
  };
};

const blankItem = (): InvoiceDraftItem => ({
  garmentType: '',
  description: '',
  quantity: '1',
  unitPrice: '',
});

const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(value);

const statusTone: Record<string, string> = {
  draft: styles.statusDraft,
  sent: styles.statusSent,
  partial: styles.statusPartial,
  paid: styles.statusPaid,
  overdue: styles.statusOverdue,
};

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(10);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [dueAmount, setDueAmount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [clientChangeNotice, setClientChangeNotice] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientLoadError, setClientLoadError] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const clientPickerRef = useRef<HTMLDivElement>(null);
  const clientSearchRef = useRef<HTMLInputElement>(null);
  const [clientOrders, setClientOrders] = useState<ClientOrder[]>([]);
  const [invoicedOrders, setInvoicedOrders] = useState<Record<string, string>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [items, setItems] = useState<InvoiceDraftItem[]>([blankItem()]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const { garmentTypes, garmentTypesError } = useGarmentTypes(creating);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiFetch(`${API}/invoices?skip=${skip}&limit=${limit}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.message === 'string' ? body.message : 'Invoices could not be loaded.');
        }
        const page = (await response.json()) as InvoicePage;
        if (active) {
          if (page.total > 0 && skip >= page.total) {
            setSkip(Math.floor((page.total - 1) / limit) * limit);
            return;
          }
          setInvoices(page.data);
          setTotalInvoices(page.summary.totalInvoices);
          setDueAmount(page.summary.dueAmount);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Invoices could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [skip, limit]);

  useEffect(() => {
    if (!creating || selectedClient) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setClientsLoading(true);
      apiFetch(`${API}/clients?q=${encodeURIComponent(clientQuery)}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Clients could not be loaded.');
          const data = (await response.json()) as Client[];
          if (active) {
            setClients(data);
            setClientLoadError('');
          }
        })
        .catch((cause: unknown) => {
          if (active) setClientLoadError(cause instanceof Error ? cause.message : 'Clients could not be loaded.');
        })
        .finally(() => {
          if (active) setClientsLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [creating, clientQuery, selectedClient]);

  useEffect(() => {
    if (clientPickerOpen) clientSearchRef.current?.focus();
  }, [clientPickerOpen]);

  useEffect(() => {
    if (!clientPickerOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !clientPickerRef.current?.contains(event.target)) {
        setClientPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [clientPickerOpen]);

  useEffect(() => {
    if (!selectedClient) {
      setClientOrders([]);
      setInvoicedOrders({});
      return;
    }

    let active = true;
    setOrdersLoading(true);
    Promise.all([
      apiFetch(`${API}/clients/${selectedClient._id}/summary`, { cache: 'no-store' }),
      apiFetch(`${API}/invoices/client/${selectedClient._id}`, { cache: 'no-store' }),
    ])
      .then(async ([ordersResponse, invoicesResponse]) => {
        if (!ordersResponse.ok) throw new Error('This client’s orders could not be loaded.');
        if (!invoicesResponse.ok) throw new Error('This client’s invoices could not be loaded.');
        const [summary, invoices] = await Promise.all([
          ordersResponse.json() as Promise<InvoiceSummary>,
          invoicesResponse.json() as Promise<ClientInvoice[]>,
        ]);
        if (!active) return;
        setClientOrders(summary.orders ?? []);
        setInvoicedOrders(Object.fromEntries(
          invoices.flatMap((invoice) => invoice.items
            .filter((item) => item.orderId)
            .map((item) => [item.orderId as string, invoice.invoiceNumber])),
        ));
      })
      .catch((cause: unknown) => {
        if (active) setCreateError(cause instanceof Error ? cause.message : 'This client’s orders could not be loaded.');
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedClient]);

  const updateItem = (index: number, patch: Partial<InvoiceDraftItem>) => {
    setItems((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    ));
  };

  const addOrder = (order: ClientOrder) => {
    if (invoicedOrders[order._id] || items.some((item) => item.orderId === order._id)) return;
    setItems((current) => [
      ...current,
      {
        orderId: order._id,
        garmentType: order.garmentType,
        description: '',
        quantity: '1',
        unitPrice: String(order.totalAmount ?? ''),
      },
    ]);
  };

  const resetCreateForm = () => {
    setSelectedClient(null);
    setClientQuery('');
    setClientPickerOpen(false);
    setItems([blankItem()]);
    setDueDate('');
    setNotes('');
    setCreateError('');
    setClientChangeNotice('');
    setCreating(false);
  };

  const createInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError('');
    if (!selectedClient) {
      setCreateError('Select a client before creating the invoice.');
      return;
    }

    const validItems = items.filter((item) => item.garmentType.trim() || item.unitPrice);
    if (validItems.length === 0 || validItems.some((item) =>
      !item.garmentType.trim() ||
      !Number.isInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1 ||
      !Number.isInteger(Number(item.unitPrice)) ||
      Number(item.unitPrice) < 0
    )) {
      setCreateError('Enter an item name, a whole-number quantity, and a valid whole-rupee price for each item.');
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch(`${API}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient._id,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          items: validItems.map((item) => ({
            orderId: item.orderId,
            garmentType: item.garmentType.trim(),
            description: item.description.trim() || undefined,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Invoice could not be created.';
        throw new Error(message);
      }

      const created = (await response.json()) as Invoice;
      resetCreateForm();
      router.push(`/invoices/${created._id}`);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Invoice could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const draftTotal = items.reduce((sum, item) =>
    sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);

  return (
    <main className={styles.page}>
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Invoices' }]} />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Billing</p>
          <h1 className={styles.title}>Invoices</h1>
          <p className={styles.subtitle}>All issued and pending client invoices</p>
        </div>
        {!creating && (
          <button
            type="button"
            className={styles.createButton}
            onClick={() => {
              setCreateError('');
              setCreating(true);
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Create invoice
          </button>
        )}
      </header>

      {creating && (
        <form className={styles.createForm} onSubmit={createInvoice}>
          <div className={styles.formHeading}>
            <div>
              <p className={styles.eyebrow}>New invoice</p>
              <h2>Create a client invoice</h2>
            </div>
            <div className={styles.formHeadingActions}>
              <strong>Invoice number is assigned automatically</strong>
              <button
                type="button"
                className={styles.closeFormButton}
                aria-label="Close invoice form"
                title="Close form"
                onClick={() => {
                  setCreateError('');
                  setCreating(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>

          {!selectedClient ? (
            <div className={styles.clientPicker} ref={clientPickerRef}>
              <span className={styles.fieldLabel}>Select client</span>
              <button
                type="button"
                className={styles.clientPickerTrigger}
                aria-haspopup="listbox"
                aria-expanded={clientPickerOpen}
                onClick={() => {
                  setCreateError('');
                  setClientPickerOpen((open) => !open);
                }}
              >
                <span>Choose a client</span><span aria-hidden="true">⌄</span>
              </button>
              {clientPickerOpen && (
                <div className={styles.clientDropdown}>
                  <input
                    ref={clientSearchRef}
                    className={styles.formInput}
                    value={clientQuery}
                    onChange={(event) => {
                      setClientQuery(event.target.value);
                      setClientsLoading(true);
                      setClientLoadError('');
                      setCreateError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setClientPickerOpen(false);
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        clientPickerRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
                      }
                    }}
                    placeholder="Search by client name or phone"
                    aria-label="Search clients by name or phone"
                    aria-autocomplete="list"
                    autoComplete="off"
                  />
                  <div className={styles.clientOptions} role="listbox" aria-label="Clients">
                    {clientLoadError ? <p className={styles.clientSearchError} role="alert">{clientLoadError}</p> :
                      clientsLoading ? <p className={styles.formHint}>Searching clients…</p> :
                      clients.length === 0 ? <p className={styles.formHint}>No clients found. Try another name or phone.</p> :
                        clients.map((client) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected="false"
                            className={styles.clientOption}
                            key={client._id}
                            onClick={() => {
                              setSelectedClient(client);
                              setClientQuery('');
                              setClientPickerOpen(false);
                              setCreateError('');
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setClientPickerOpen(false);
                              } else if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                (event.currentTarget.nextElementSibling as HTMLButtonElement | null)?.focus();
                              } else if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                if (event.currentTarget.previousElementSibling instanceof HTMLButtonElement) {
                                  event.currentTarget.previousElementSibling.focus();
                                } else {
                                  clientSearchRef.current?.focus();
                                }
                              }
                            }}
                          >
                            <strong>{client.name}</strong><span>{client.phone}</span>
                          </button>
                        ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.selectedClient}>
              <div><span className={styles.fieldLabel}>Invoice for</span><strong>{selectedClient.name}</strong><span>{selectedClient.phone}</span></div>
              <button type="button" className={styles.textButton} onClick={() => {
              const hasLinkedOrders = items.some((item) => item.orderId);
              if (hasLinkedOrders) {
                setItems((current) => current.filter((item) => !item.orderId));
                setClientChangeNotice('Order items linked to the previous client were removed. Custom items were kept.');
              } else {
                setClientChangeNotice('');
              }
              setSelectedClient(null);
              setClientOrders([]);
              setClientQuery('');
              setClientPickerOpen(true);
              }}>Change client</button>
            </div>
          )}
          {clientChangeNotice && <p className={styles.formHint} role="status">{clientChangeNotice}</p>}

          {selectedClient && (
            <>
              {clientOrders.length > 0 && (
                <section className={styles.orderPicker}>
                  <div className={styles.orderPickerHeading}>
                    <strong>Add from this client’s orders</strong>
                    {ordersLoading && <span>Loading…</span>}
                  </div>
                  <div className={styles.orderChoices}>
                    {clientOrders.map((order) => (
                      <button
                        type="button"
                        className={styles.orderChoice}
                        key={order._id}
                        disabled={Boolean(invoicedOrders[order._id]) || items.some((item) => item.orderId === order._id)}
                        onClick={() => addOrder(order)}
                      >
                        <span>{order.garmentType}</span>
                        <strong>{order.totalAmount === undefined ? 'Price not set' : money(order.totalAmount)}</strong>
                        <span aria-hidden="true">{invoicedOrders[order._id] ? `In ${invoicedOrders[order._id]}` : items.some((item) => item.orderId === order._id) ? 'Added' : 'Add'}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {ordersLoading && clientOrders.length === 0 && <p className={styles.formHint}>Loading this client’s orders…</p>}

              <div className={styles.itemHeading}>
                <h3>Invoice items</h3>
                <button type="button" className={styles.textButton} onClick={() => setItems((current) => [...current, blankItem()])}>+ Add custom item</button>
              </div>
              {garmentTypesError && <p className={styles.suggestionNotice} role="status">{garmentTypesError} You can still enter a custom type.</p>}
              <div className={styles.draftItems}>
                {items.map((item, index) => (
                  <div className={styles.draftItem} key={`${item.orderId ?? 'custom'}-${index}`}>
                    <GarmentTypeInput
                      id={`invoice-garment-type-${index}`}
                      value={item.garmentType}
                      options={garmentTypes}
                      required
                      placeholder="e.g. Designer blouse"
                      onChange={(value) => updateItem(index, { garmentType: value })}
                    />
                    <label className={styles.draftField}>
                      Description
                      <input className={styles.formInput} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Optional details" />
                    </label>
                    <label className={styles.draftField}>
                      Quantity
                      <input className={styles.formInput} type="number" min="1" step="1" required value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                    </label>
                    <label className={styles.draftField}>
                      Unit price (₹)
                      <input className={styles.formInput} type="number" min="0" step="1" required value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: event.target.value })} />
                    </label>
                    <strong className={styles.lineTotal}>{money((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</strong>
                    {items.length > 1 && <button type="button" className={styles.removeItem} aria-label={`Remove item ${index + 1}`} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}
                  </div>
                ))}
              </div>

              <div className={styles.invoiceFormExtras}>
                <label className={styles.draftField}>
                  Due date (optional)
                  <input className={styles.formInput} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </label>
                <label className={styles.draftField}>
                  Notes (optional)
                  <input className={styles.formInput} value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} placeholder="Notes shown on the invoice" />
                </label>
                <div className={styles.draftTotal}><span>Invoice total</span><strong>{money(draftTotal)}</strong></div>
              </div>
              {createError && <p className={styles.formError} role="alert">{createError}</p>}
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelButton} disabled={saving} onClick={resetCreateForm}>Cancel</button>
                <button type="submit" className={styles.createButton} disabled={saving || !items.some((item) => item.garmentType.trim() && item.unitPrice !== '')}>
                  {saving ? 'Creating invoice…' : 'Create invoice'}
                </button>
              </div>
            </>
          )}
          {!selectedClient && createError && <p className={styles.formError} role="alert">{createError}</p>}
        </form>
      )}

      <section className={styles.summary}>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>
            <span className={styles.summaryIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" />
                <path d="M14 3.75v4h4M8.5 12h7M8.5 15.5h7" />
              </svg>
            </span>
            <span>Total invoices</span>
          </div>
          <strong>{totalInvoices.toLocaleString('en-IN')}</strong>
          <span className={styles.summaryCaption}>Invoices issued to clients</span>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryLabel}>
            <span className={`${styles.summaryIcon} ${styles.balanceIcon}`} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3.5v17M16.5 7.5c0-1.7-1.8-3-4.5-3S7.5 5.8 7.5 7.5 9.3 10 12 10s4.5 1.3 4.5 3-1.8 3.5-4.5 3.5-4.5-1.3-4.5-3" />
              </svg>
            </span>
            <span>Outstanding balance</span>
          </div>
          <strong>{money(dueAmount)}</strong>
          <span className={styles.summaryCaption}>Remaining across all invoices</span>
        </article>
      </section>

      {loading ? <p className={styles.state}>Loading invoices…</p> :
        error ? <p className={styles.state}>{error}</p> :
          totalInvoices === 0 ? (
            <section className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true">
                <svg viewBox="0 0 48 48">
                  <path d="M15 7.5h13l8 8v22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3v-27a3 3 0 0 1 3-3Z" />
                  <path d="M28 7.5v8h8M18 24h12M18 30h12" />
                </svg>
              </div>
              <p className={styles.emptyEyebrow}>Your billing workspace</p>
              <h2>No invoices yet</h2>
              <p className={styles.emptyDescription}>
                Create a polished invoice for a client and keep every payment in one place.
              </p>
              <button
                type="button"
                className={styles.emptyAction}
                onClick={() => {
                  setCreateError('');
                  setCreating(true);
                }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 4v12M4 10h12" />
                </svg>
                Create your first invoice
              </button>
            </section>
          ) : (
            <>
            <section className={styles.list}>
              {invoices.map((invoice) => (
                <Link href={`/invoices/${invoice._id}`} className={styles.card} key={invoice._id}>
                  <div className={styles.cardHeader}>
                    <span className={styles.invoiceNo}>{invoice.invoiceNumber}</span>
                    <span className={`${styles.status} ${statusTone[invoice.status] ?? styles.statusDraft}`}>
                      {invoice.status}
                    </span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.meta}>
                      <strong>{invoice.clientId?.name ?? 'Unknown client'}</strong>
                      <span>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(invoice.invoiceDate))}</span>
                      {invoice.dueDate && <span>Due: {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(invoice.dueDate))}</span>}
                    </div>
                    <div className={styles.amount}>
                      <strong>{money(invoice.total)}</strong>
                      <span>Balance: {money(invoice.balanceAmount)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </section>
            <nav className={styles.pagination} aria-label="Invoice pages">
              <span className={styles.pageSummary}>
                Showing {skip + 1}–{Math.min(skip + invoices.length, totalInvoices)} of {totalInvoices}
              </span>
              <label className={styles.pageSize}>
                Per page
                <select
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
                    setSkip(0);
                  }}
                >
                  {[10, 20, 50].map((size) => <option value={size} key={size}>{size}</option>)}
                </select>
              </label>
              <div className={styles.pageButtons}>
                <button type="button" disabled={skip === 0 || loading} onClick={() => setSkip(Math.max(0, skip - limit))}>Previous</button>
                <button type="button" disabled={skip + limit >= totalInvoices || loading} onClick={() => setSkip(skip + limit)}>Next</button>
              </div>
            </nav>
            </>
          )}
    </main>
  );
}
