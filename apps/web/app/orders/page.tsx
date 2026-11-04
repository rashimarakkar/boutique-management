'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import styles from './orders.module.css';
import { API, apiFetch } from '../lib/api';
import { NewOrderDialog } from '../components/new-order-dialog';

const filters = [
  ['all', 'All orders'],
  ['pending', 'Pending work'],
  ['due_today', 'Due today'],
  ['overdue', 'Overdue'],
  ['delivered', 'Delivered'],
  ['payment_due', 'Payment due'],
  ['received', 'Has payment'],
];

type Order = {
  _id: string;
  garmentType: string;
  deliveryDate: string;
  status: string;
  totalAmount?: number;
  advancePaid?: number;
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

const labelForStatus = (status: string) =>
  status.replaceAll('_', ' ');

export default function OrdersPage() {
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

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
  }, [view, submittedSearch, skip, limit, refreshVersion]);

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

  return (
    <main className={styles.page}>
      {/* Page Header */}
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.backLink}>
            <span>←</span> Dashboard
          </Link>

          <p className={styles.eyebrow}>ORDER DIRECTORY</p>
          <h1>View orders</h1>
          <p className={styles.subtitle}>
            Manage and track all your tailoring orders.
          </p>
        </div>

        <NewOrderDialog
          label="+ New order"
          className={styles.newOrder}
          onCreated={() => setRefreshVersion((version) => version + 1)}
        />
      </header>

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
          <span>PAYMENT</span>
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
            {orders.map((order) => {
              const total = order.totalAmount ?? 0;
              const received = order.advancePaid ?? 0;
              const balance = Math.max(0, total - received);

              return (
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

                  {/* Payment */}
                  <div className={styles.payment}>
                    <span className={styles.mobileLabel}>
                      Payment
                    </span>

                    <strong>
                      ₹{received.toLocaleString('en-IN')}
                    </strong>

                    {total > 0 ? (
                      <span>
                        Total: ₹{total.toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span>Amount not added</span>
                    )}

                    {balance > 0 && (
                      <span className={styles.balance}>
                        ₹{balance.toLocaleString('en-IN')} due
                      </span>
                    )}
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
              );
            })}
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