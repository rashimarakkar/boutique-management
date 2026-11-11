'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import styles from './orders.module.css';
import { API, apiFetch } from '../lib/api';
import { NewOrderDialog } from '../components/new-order-dialog';
import { Breadcrumbs } from '../components/breadcrumbs';

const filters = [
  ['all', 'All orders'],
  ['pending', 'Pending work'],
  ['due_today', 'Due today'],
  ['overdue', 'Overdue'],
  ['delivered', 'Delivered'],
];

type Order = {
  _id: string;
  garmentType: string;
  deliveryDate: string;
  status: string;
  totalAmount?: number;
  clientId: {
    name: string;
    phone: string;
  };
};
type OrderPage = {
  data: Order[];
  total: number;
  skip: number;
  limit: number;
};

const PAGE_SIZES = [10, 20, 50];
const EXPORT_PAGE_SIZE = 100;

type DateFilter = 'all' | 'current_month' | 'previous_month' | 'custom';

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDateFilterParams = (
  params: URLSearchParams,
  dateFilter: DateFilter,
  dateFrom: string,
  dateTo: string,
) => {
  if (dateFilter === 'custom') {
    if (dateFrom) params.set('startDate', dateFrom);
    if (dateTo) params.set('endDate', dateTo);
    return;
  }
  if (dateFilter === 'all') return;

  const offset = dateFilter === 'current_month' ? 0 : -1;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  params.set('startDate', toDateInputValue(start));
  params.set('endDate', toDateInputValue(end));
};

const labelForStatus = (status: string) =>
  status.replaceAll('_', ' ');
const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export default function OrdersPage() {
  const [view, setView] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    const requestedView = new URLSearchParams(
      window.location.search
    ).get('view');

    if (requestedView) setView(requestedView);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();

    if (view !== 'all') params.set('view', view);
    if (submittedSearch) params.set('q', submittedSearch);
    addDateFilterParams(params, dateFilter, dateFrom, dateTo);
    params.set('skip', String(skip));
    params.set('limit', String(limit));

    setOrders(null);
    setError('');
    const controller = new AbortController();

    apiFetch(`${API}/orders?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();

        const page = (await response.json()) as OrderPage;
        setOrders(page.data);
        setTotal(page.total);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setOrders([]);
        setTotal(0);
        setError(
          'Orders could not be loaded. Check that the API is running.'
        );
      });
    return () => controller.abort();
  }, [view, dateFilter, dateFrom, dateTo, submittedSearch, skip, limit, refreshVersion]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedSearch(search.trim());
    setSkip(0);
  };

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));

  const exportOrders = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setExportError('Allow pop-ups for this site to export orders.');
      return;
    }

    setExporting(true);
    setExportError('');
    printWindow.document.write('<!doctype html><title>Preparing orders PDF</title><p>Preparing orders…</p>');
    printWindow.document.close();

    try {
      const allOrders: Order[] = [];
      let exportTotal = 0;
      let exportSkip = 0;

      do {
        const params = new URLSearchParams();
        if (view !== 'all') params.set('view', view);
        if (submittedSearch) params.set('q', submittedSearch);
        addDateFilterParams(params, dateFilter, dateFrom, dateTo);
        params.set('skip', String(exportSkip));
        params.set('limit', String(EXPORT_PAGE_SIZE));

        const response = await apiFetch(`${API}/orders?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Orders could not be loaded for export.');

        const page = (await response.json()) as OrderPage;
        allOrders.push(...page.data);
        exportTotal = page.total;
        exportSkip += page.limit;
      } while (allOrders.length < exportTotal);

      const rows = allOrders.map((order) => {
        const totalAmount = order.totalAmount ?? 0;
        return `<tr>
          <td>${escapeHtml(order.clientId?.name ?? 'Unknown client')}</td>
          <td>${escapeHtml(order.clientId?.phone ?? '')}</td>
          <td>${escapeHtml(order.garmentType)}</td>
          <td>${escapeHtml(formatDate(order.deliveryDate))}</td>
          <td>${escapeHtml(labelForStatus(order.status))}</td>
          <td>₹${totalAmount.toLocaleString('en-IN')}</td>
        </tr>`;
      }).join('');
      const filterLabel = filters.find(([value]) => value === view)?.[1] ?? 'All orders';
      const dateLabel = dateFilter === 'current_month'
        ? 'Current month'
        : dateFilter === 'previous_month'
          ? 'Previous month'
          : dateFilter === 'custom'
            ? `Date range${dateFrom || dateTo ? ` - ${dateFrom || '…'} to ${dateTo || '…'}` : ''}`
            : '';
      const title = `Orders - ${filterLabel}${dateLabel ? ` - ${dateLabel}` : ''}${submittedSearch ? ` - ${submittedSearch}` : ''}`;

      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <title>${escapeHtml(title)}</title>
            <style>
              @page { size: landscape; margin: 12mm; }
              * { box-sizing: border-box; }
              body { color: #292725; font: 12px Arial, sans-serif; }
              h1 { margin: 0 0 6px; font: 700 22px Georgia, serif; }
              .meta { margin: 0 0 18px; color: #665f56; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 8px 7px; border: 1px solid #ded8d0; text-align: left; }
              th { background: #f2efeb; font-size: 10px; text-transform: uppercase; }
              tr { break-inside: avoid; }
              @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <h1>Hamiz Boutique — Orders</h1>
            <p class="meta">${escapeHtml(filterLabel)}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ''}${submittedSearch ? ` · Search: ${escapeHtml(submittedSearch)}` : ''} · ${allOrders.length} orders · Exported ${escapeHtml(new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date()))}</p>
            <table>
              <thead><tr><th>Client</th><th>Phone</th><th>Garment</th><th>Delivery</th><th>Status</th><th>Order estimate</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <script>window.addEventListener('load', () => window.print());</script>
          </body>
        </html>`);
      printWindow.document.close();
    } catch (cause) {
      printWindow.close();
      setExportError(cause instanceof Error ? cause.message : 'Orders could not be exported.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className={styles.page}>
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Orders' }]} />
      {/* Page Header */}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ORDER DIRECTORY</p>
          <h1>View orders</h1>
          <p className={styles.subtitle}>
            Manage and track all your tailoring orders.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.exportButton}
            onClick={exportOrders}
            disabled={exporting || total === 0}
          >
            {exporting ? 'Preparing PDF…' : 'Export PDF'}
          </button>
          <NewOrderDialog
            label="+ New order"
            className={styles.newOrder}
            onCreated={() => setRefreshVersion((version) => version + 1)}
          />
        </div>
      </header>
      {exportError && <p className={styles.exportError} role="alert">{exportError}</p>}

      {/* Search and Filters */}
      <section className={styles.controls}>
        <form onSubmit={submit} className={styles.searchForm}>
          <div className={styles.searchInput}>
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search client, phone, or garment..."
            />
          </div>

          <button type="submit" className={styles.searchButton}>
            Search
          </button>
        </form>

        <div className={styles.dateFilters}>
          <label className={styles.dateFilter}>
            Order date
            <select
              value={dateFilter}
              onChange={(event) => {
                setDateFilter(event.target.value as DateFilter);
                setSkip(0);
              }}
            >
              <option value="all">All dates</option>
              <option value="current_month">Current month</option>
              <option value="previous_month">Previous month</option>
              <option value="custom">Date range</option>
            </select>
          </label>
          {dateFilter === 'custom' && (
            <div className={styles.dateRange}>
              <label>
                From
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setSkip(0);
                  }}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setSkip(0);
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <div className={styles.filterRow}>
          {filters.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={`${styles.filterButton} ${
                view === value ? styles.activeFilter : ''
              }`}
              onClick={() => {
                setView(value);
                setSkip(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Orders List */}
      <section className={styles.ordersCard}>
        <div className={styles.listHeading}>
          <span>CLIENT & ORDER</span>
          <span>DELIVERY DATE</span>
          <span>STATUS</span>
        </div>

        {orders === null ? (
          <div className={styles.state}>Loading orders...</div>
        ) : error ? (
          <div className={`${styles.state} ${styles.error}`}>
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>✂</div>
            <h3>No orders found</h3>
            <p>
              There are no orders matching your search or filter.
            </p>
            <NewOrderDialog
              label="Create your first order"
              className={styles.emptyLink}
              onCreated={() => setRefreshVersion((version) => version + 1)}
            />
          </div>
        ) : (
          <div className={styles.orderList}>
            {orders.map((order) => (
                <Link
                  href={`/orders/${order._id}`}
                  key={order._id}
                  className={styles.orderRow}
                >
                  {/* Client */}
                  <div className={styles.client}>
                    <div className={styles.avatar}>
                      {order.clientId?.name?.[0]?.toUpperCase() ?? '?'}
                    </div>

                    <div className={styles.clientInfo}>
                      <strong>
                        {order.clientId?.name ?? 'Unknown client'}
                      </strong>

                      <span>{order.garmentType}</span>

                      <span className={styles.phone}>
                        {order.clientId?.phone}
                      </span>
                    </div>
                  </div>

                  {/* Delivery */}
                  <div className={styles.delivery}>
                    <span className={styles.mobileLabel}>
                      Delivery
                    </span>
                    <strong>
                      {formatDate(order.deliveryDate)}
                    </strong>
                  </div>

                  {/* Status */}
                  <div className={styles.statusColumn}>
                    <span className={styles.mobileLabel}>
                      Status
                    </span>

                    <span
                      className={`${styles.status} ${
                       styles[order.status as keyof typeof styles] ?? styles.defaultStatus
                      }`}
                    >
                      {labelForStatus(order.status)}
                    </span>
                  </div>
                </Link>
            ))}
          </div>
        )}
      </section>

      <div className={styles.pagination}>
        <label className={styles.pageSize}>
          Orders per page
          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setSkip(0);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <span className={styles.footerNote}>
          {total === 0
            ? 'Showing 0 orders'
            : `Showing ${skip + 1}–${Math.min(skip + limit, total)} of ${total} orders`}
        </span>
        <div className={styles.pageButtons}>
          <button
            type="button"
            disabled={skip === 0 || orders === null}
            onClick={() => setSkip(Math.max(0, skip - limit))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={orders === null || skip + limit >= total}
            onClick={() => setSkip(skip + limit)}
          >
            Next
          </button>
        </div>
      </div>
    </main>
  );
}