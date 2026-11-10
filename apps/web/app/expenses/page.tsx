'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { API, apiFetch } from '../lib/api';
import styles from './expenses.module.css';

type Expense = {
  _id: string;
  category: string;
  description?: string;
  amount: number;
  expenseDate: string;
};

type ExpenseCategory = {
  _id: string;
  name: string;
};

type ExpensePage = {
  data: Expense[];
  total: number;
  totalAmount: number;
  skip: number;
  limit: number;
};

type DateFilter = 'all' | 'current_month' | 'previous_month' | 'custom';

const PAGE_SIZE = 20;

const localDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateFilterParams = (
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
  params.set('startDate', localDateValue(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
  params.set('endDate', localDateValue(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)));
};

const dateForInput = (date: Date) => localDateValue(date);

const displayDate = (date: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));

const formatAmount = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    return fallback;
  }
  return fallback;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [category, setCategory] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('current_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [form, setForm] = useState({
    category: '',
    description: '',
    amount: '',
    expenseDate: dateForInput(new Date()),
  });

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(PAGE_SIZE),
    });
    if (category) params.set('category', category);
    dateFilterParams(params, dateFilter, dateFrom, dateTo);

    try {
      const [expenseResponse, categoriesResponse] = await Promise.all([
        apiFetch(`${API}/expenses?${params.toString()}`, { cache: 'no-store' }),
        apiFetch(`${API}/expenses/categories`, { cache: 'no-store' }),
      ]);
      if (!expenseResponse.ok) {
        throw new Error(await responseError(expenseResponse, 'Expenses could not be loaded.'));
      }
      if (!categoriesResponse.ok) {
        throw new Error(await responseError(categoriesResponse, 'Expense categories could not be loaded.'));
      }
      const page = (await expenseResponse.json()) as ExpensePage;
      const savedCategories = (await categoriesResponse.json()) as ExpenseCategory[];
      setExpenses(page.data);
      setTotal(page.total);
      setTotalAmount(page.totalAmount);
      setCategories(savedCategories);
    } catch (cause) {
      setExpenses([]);
      setTotal(0);
      setTotalAmount(0);
      setError(cause instanceof Error ? cause.message : 'Expenses could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [category, dateFilter, dateFrom, dateTo, skip]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const resetForm = () => {
    setEditingId('');
    setFormError('');
    setForm({
      category: '',
      description: '',
      amount: '',
      expenseDate: dateForInput(new Date()),
    });
  };

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    const isEditing = Boolean(editingId);
    setSaving(true);
    setFormError('');
    try {
      const response = await apiFetch(
        `${API}/expenses${editingId ? `/${encodeURIComponent(editingId)}` : ''}`,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: form.category.trim(),
            description: form.description.trim(),
            amount: Number(form.amount),
            expenseDate: form.expenseDate,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(await responseError(response, 'Expense could not be saved.'));
      }
      resetForm();
      if (!isEditing && skip > 0) setSkip(0);
      else await loadExpenses();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Expense could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const editExpense = (expense: Expense) => {
    setEditingId(expense._id);
    setForm({
      category: expense.category,
      description: expense.description ?? '',
      amount: String(expense.amount),
      expenseDate: expense.expenseDate.slice(0, 10),
    });
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteExpense = async (expense: Expense) => {
    if (!window.confirm(`Delete the ${expense.category} expense of ${formatAmount(expense.amount)}?`)) {
      return;
    }
    setError('');
    try {
      const response = await apiFetch(`${API}/expenses/${encodeURIComponent(expense._id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Expense could not be deleted.'));
      }
      if (expenses.length === 1 && skip > 0) setSkip((current) => Math.max(0, current - PAGE_SIZE));
      else await loadExpenses();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expense could not be deleted.');
    }
  };

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault();
    setCategorySaving(true);
    setCategoryError('');
    try {
      const response = await apiFetch(
        `${API}/expenses/categories${editingCategoryId ? `/${encodeURIComponent(editingCategoryId)}` : ''}`,
        {
          method: editingCategoryId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: categoryName.trim() }),
        },
      );
      if (!response.ok) {
        throw new Error(await responseError(response, 'Category could not be saved.'));
      }
      const renamedFrom = editingCategoryName;
      const renamedTo = categoryName.trim();
      setEditingCategoryId('');
      setEditingCategoryName('');
      setCategoryName('');
      if (renamedFrom && category === renamedFrom) setCategory(renamedTo);
      else await loadExpenses();
    } catch (cause) {
      setCategoryError(cause instanceof Error ? cause.message : 'Category could not be saved.');
    } finally {
      setCategorySaving(false);
    }
  };

  const startCategoryEdit = (item: ExpenseCategory) => {
    setEditingCategoryId(item._id);
    setEditingCategoryName(item.name);
    setCategoryName(item.name);
    setCategoryError('');
  };

  const cancelCategoryEdit = () => {
    setEditingCategoryId('');
    setEditingCategoryName('');
    setCategoryName('');
    setCategoryError('');
  };

  const deleteCategory = async (item: ExpenseCategory) => {
    if (!window.confirm(`Delete the "${item.name}" category? Categories used by expenses cannot be deleted.`)) {
      return;
    }
    setCategoryError('');
    try {
      const response = await apiFetch(`${API}/expenses/categories/${encodeURIComponent(item._id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Category could not be deleted.'));
      }
      if (category === item.name) setCategory('');
      if (editingCategoryId === item._id) cancelCategoryEdit();
      await loadExpenses();
    } catch (cause) {
      setCategoryError(cause instanceof Error ? cause.message : 'Category could not be deleted.');
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.backLink}>← Dashboard</Link>
          <p className={styles.eyebrow}>BUSINESS ACCOUNTS</p>
          <h1>Expenses</h1>
          <p className={styles.subtitle}>Record and organize your boutique expenses.</p>
        </div>
      </header>

      <section className={styles.totalCard} aria-live="polite">
        <span>Total for the selected filters</span>
        <strong>{formatAmount(totalAmount)}</strong>
      </section>

      <div className={styles.layout}>
        <div className={styles.sidebar}>
        <section className={styles.formCard}>
          <h2>{editingId ? 'Edit expense' : 'Add an expense'}</h2>
          <form className={styles.form} onSubmit={saveExpense}>
            <label>
              Category
              <select
                required
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="">Select a category</option>
                {categories.map((item) => <option key={item._id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label>
              Amount (₹)
              <input
                type="number"
                required
                min="1"
                max="1000000000"
                step="1"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="e.g. 1500"
              />
            </label>
            <label>
              Date
              <input
                type="date"
                required
                value={form.expenseDate}
                onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))}
              />
            </label>
            <label>
              Description (optional)
              <input
                maxLength={300}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Add a note"
              />
            </label>
            {formError && <p className={styles.error} role="alert">{formError}</p>}
            <div className={styles.actions}>
              <button className={styles.primary} type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add expense'}
              </button>
              {editingId && (
                <button className={styles.secondary} type="button" onClick={resetForm} disabled={saving}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className={styles.categoryCard}>
          <h2>{editingCategoryId ? 'Rename category' : 'Manage categories'}</h2>
          <form className={styles.categoryForm} onSubmit={saveCategory}>
            <label>
              Category name
              <input
                required
                maxLength={80}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="e.g. Equipment"
              />
            </label>
            <div className={styles.actions}>
              <button className={styles.primary} type="submit" disabled={categorySaving}>
                {categorySaving ? 'Saving…' : editingCategoryId ? 'Save name' : 'Add category'}
              </button>
              {editingCategoryId && (
                <button className={styles.secondary} type="button" onClick={cancelCategoryEdit} disabled={categorySaving}>
                  Cancel
                </button>
              )}
            </div>
          </form>
          {categoryError && <p className={`${styles.error} ${styles.categoryError}`} role="alert">{categoryError}</p>}
          {categories.length === 0 ? (
            <p className={styles.categoryEmpty}>No categories yet. Add one to start recording expenses.</p>
          ) : (
            <ul className={styles.categoryList}>
              {categories.map((item) => (
                <li key={item._id}>
                  <span>{item.name}</span>
                  <div className={styles.rowActions}>
                    <button className={styles.editButton} type="button" onClick={() => startCategoryEdit(item)}>
                      Rename
                    </button>
                    <button className={styles.deleteButton} type="button" onClick={() => void deleteCategory(item)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>

        <section className={styles.listCard}>
          <h2>Expense history</h2>
          <div className={styles.filter}>
            <label>
              Category
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setSkip(0);
                }}
              >
                <option value="">All categories</option>
                {categories.map((item) => <option key={item._id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label>
              Date
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
            <span />
            {dateFilter === 'custom' && (
              <>
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
              </>
            )}
          </div>

          {error ? (
            <p className={`${styles.state} ${styles.error}`} role="alert">{error}</p>
          ) : loading ? (
            <p className={styles.state}>Loading expenses…</p>
          ) : expenses.length === 0 ? (
            <p className={styles.state}>No expenses match these filters. Add an expense to get started.</p>
          ) : (
            <>
              <div className={styles.tableHeader}>
                <span>Category</span><span>Description</span><span>Date</span><span>Amount</span><span>Actions</span>
              </div>
              {expenses.map((expense) => (
                <article className={styles.expenseRow} key={expense._id}>
                  <strong className={styles.expenseCategory}>{expense.category}</strong>
                  <span className={styles.description}>{expense.description || '—'}</span>
                  <time className={styles.expenseDate} dateTime={expense.expenseDate}>
                    {displayDate(expense.expenseDate)}
                  </time>
                  <span className={styles.expenseAmount}>{formatAmount(expense.amount)}</span>
                  <div className={styles.rowActions}>
                    <button className={styles.editButton} type="button" onClick={() => editExpense(expense)}>
                      Edit
                    </button>
                    <button className={styles.deleteButton} type="button" onClick={() => void deleteExpense(expense)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              <div className={styles.pagination}>
                <span>{total === 0 ? 'Showing 0 expenses' : `Showing ${skip + 1}–${Math.min(skip + PAGE_SIZE, total)} of ${total} expenses`}</span>
                <div className={styles.paginationActions}>
                  <button type="button" disabled={skip === 0 || loading} onClick={() => setSkip((value) => Math.max(0, value - PAGE_SIZE))}>
                    Previous
                  </button>
                  <button type="button" disabled={loading || skip + PAGE_SIZE >= total} onClick={() => setSkip((value) => value + PAGE_SIZE)}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
