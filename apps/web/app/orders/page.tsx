'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import styles from './orders.module.css';

const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

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

const labelForStatus = (status: string) =>
  status.replaceAll('_', ' ');

export default function OrdersPage() {
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

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

    setOrders(null);
    setError('');

    fetch(`${API}/orders?${params.toString()}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();

        setOrders(await response.json());
      })
      .catch(() => {
        setOrders([]);
        setError(
          'Orders could not be loaded. Check that the API is running.'
        );
      });
  }, [view, submittedSearch]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedSearch(search.trim());
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

        <Link href="/" className={styles.newOrder}>
          <span>+</span> New order
        </Link>
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
              onClick={() => setView(value)}
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
            <Link href="/" className={styles.emptyLink}>
              Create your first order
            </Link>
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

      <p className={styles.footerNote}>
        Showing {orders?.length ?? 0} orders
      </p>
    </main>
  );
}