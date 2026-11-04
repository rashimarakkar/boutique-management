'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { NewOrderDialog } from '../components/new-order-dialog';
import { API, apiFetch } from '../lib/api';
import styles from './clients.module.css';

type Client = {
  _id: string;
  name: string;
  phone: string;
  email?: string;
};
type ClientPage = {
  data: Client[];
  total: number;
  skip: number;
  limit: number;
};
const PAGE_SIZES = [10, 20, 50];

export default function ClientsPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [clients, setClients] = useState<Client[] | null>(null);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (submittedQuery) params.set('q', submittedQuery);
    params.set('skip', String(skip));
    params.set('limit', String(limit));

    setClients(null);
    setError('');
    apiFetch(`${API}/clients/paged?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Clients could not be loaded.');
        const page = (await response.json()) as ClientPage;
        setClients(page.data);
        setTotal(page.total);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Clients could not be loaded.');
        setClients([]);
        setTotal(0);
      });

    return () => controller.abort();
  }, [submittedQuery, skip, limit, refreshVersion]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    setSkip(0);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>← Dashboard</Link>
          <p className={styles.eyebrow}>CLIENT DIRECTORY</p>
          <h1>Clients</h1>
          <p className={styles.subtitle}>Find a client to view their orders and account summary.</p>
        </div>
        <NewOrderDialog
          label="+ New order"
          className={styles.newOrder}
          onCreated={() => setRefreshVersion((version) => version + 1)}
        />
      </header>

      <form className={styles.search} onSubmit={submit}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by client name or phone"
          aria-label="Search clients"
        />
        <button type="submit">Search</button>
      </form>

      <section className={styles.list}>
        {clients === null ? <p className={styles.state}>Loading clients…</p> :
          error ? <p className={styles.state}>{error}</p> :
            clients.length === 0 ? <p className={styles.state}>No clients found.</p> :
              clients.map((client) => (
                <Link className={styles.client} href={`/clients/${client._id}`} key={client._id}>
                  <span className={styles.avatar}>{client.name[0]?.toUpperCase() ?? '?'}</span>
                  <span className={styles.details}>
                    <strong>{client.name}</strong>
                    <span>{client.phone}</span>
                    {client.email && <span>{client.email}</span>}
                  </span>
                  <span className={styles.arrow}>View history →</span>
                </Link>
              ))}
      </section>
      <div className={styles.pagination}>
        <label className={styles.pageSize}>
          Clients per page
          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setSkip(0);
            }}
          >
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <span className={styles.pageCount}>
          {total === 0
            ? 'Showing 0 clients'
            : `Showing ${skip + 1}–${Math.min(skip + limit, total)} of ${total} clients`}
        </span>
        <div className={styles.pageButtons}>
          <button type="button" disabled={skip === 0 || clients === null} onClick={() => setSkip(Math.max(0, skip - limit))}>
            Previous
          </button>
          <button type="button" disabled={clients === null || skip + limit >= total} onClick={() => setSkip(skip + limit)}>
            Next
          </button>
        </div>
      </div>
    </main>
  );
}
