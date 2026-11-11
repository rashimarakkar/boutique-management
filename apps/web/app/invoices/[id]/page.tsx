'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { API, apiFetch } from '../../lib/api';
import styles from '../invoices.module.css';

type InvoiceItem = {
  garmentType: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Invoice = {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  sentAt?: string;
  dueDate?: string;
  status: string;
  subtotal: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  notes?: string;
  clientId?: {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  items: InvoiceItem[];
};

type InvoicePayment = {
  _id: string;
  amount: number;
  method: string;
  reference?: string;
  receivedAt: string;
  notes?: string;
};

type ReceiptInvoice = Pick<Invoice, 'invoiceNumber' | 'total' | 'paidAmount' | 'balanceAmount' | 'clientId'>;

type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other';
const paymentMethods: Array<[PaymentMethod, string]> = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['bank_transfer', 'Bank transfer'],
  ['card', 'Card'],
  ['other', 'Other'],
];

const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(value);
const pdfMoney = (value: number) => `Rs. ${value.toLocaleString('en-IN')}`;

const statusTone: Record<string, string> = {
  draft: styles.statusDraft,
  sent: styles.statusSent,
  partial: styles.statusPartial,
  paid: styles.statusPaid,
  overdue: styles.statusOverdue,
};

async function loadInvoiceLogo() {
  const logoResponse = await fetch('/hamiz-logo.png');
  if (!logoResponse.ok) throw new Error('Boutique logo could not be loaded for the invoice PDF.');
  const logoBlob = await logoResponse.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Boutique logo could not be converted for the invoice PDF.'));
    reader.onerror = () => reject(new Error('Boutique logo could not be read for the invoice PDF.'));
    reader.readAsDataURL(logoBlob);
  });
}

function createInvoicePdf(invoice: Invoice, logoData: string) {
  const document = new jsPDF();
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const colors = {
    ink: [48, 43, 36] as [number, number, number],
    muted: [119, 108, 91] as [number, number, number],
    gold: [164, 133, 77] as [number, number, number],
    paleGold: [247, 243, 234] as [number, number, number],
    line: [225, 216, 199] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
  document.setFillColor(...colors.white);
  document.rect(0, 0, pageWidth, pageHeight, 'F');

  const logoCard = { x: margin, y: 16, width: 29, height: 22 };
  document.setFillColor(...colors.paleGold);
  document.setDrawColor(...colors.line);
  document.setLineWidth(0.35);
  document.roundedRect(logoCard.x, logoCard.y, logoCard.width, logoCard.height, 2, 2, 'FD');
  const logoProperties = document.getImageProperties(logoData);
  const logoScale = Math.min(
    (logoCard.width - 6) / logoProperties.width,
    (logoCard.height - 6) / logoProperties.height,
  );
  const logoWidth = logoProperties.width * logoScale;
  const logoHeight = logoProperties.height * logoScale;
  document.addImage(
    logoData,
    'PNG',
    logoCard.x + (logoCard.width - logoWidth) / 2,
    logoCard.y + (logoCard.height - logoHeight) / 2,
    logoWidth,
    logoHeight,
  );
  const contactX = logoCard.x + logoCard.width + 5;
  document.setFont('helvetica', 'bold');
  document.setFontSize(9);
  document.setTextColor(...colors.ink);
  document.text('Hamiz Boutique', contactX, 18);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7.5);
  document.setTextColor(...colors.muted);
  document.text('Randathani, Kottakkal, Kerala', contactX, 24);
  document.text('Home Boutique · By appointment', contactX, 30);
  document.text('+91 9526285862', contactX, 36);
  document.setTextColor(...colors.gold);
  document.textWithLink('hamiz-boutique.netlify.app', contactX, 42, {
    url: 'https://hamiz-boutique.netlify.app',
  });
  document.setTextColor(...colors.muted);
  document.text('hamizboutique@gmail.com', contactX, 48);

  const titleX = pageWidth - margin;
  document.setFont('helvetica', 'bold');
  document.setFontSize(25);
  document.setTextColor(...colors.ink);
  document.text('INVOICE', titleX, 25, { align: 'right' });
  document.setFont('helvetica', 'normal');
  document.setFontSize(10);
  document.setTextColor(...colors.gold);
  document.text(invoice.invoiceNumber, titleX, 33, { align: 'right' });
  document.setDrawColor(...colors.gold);
  document.setLineWidth(0.7);
  document.line(pageWidth - 54, 39, pageWidth - margin, 39);
  document.setFontSize(8);
  document.setTextColor(...colors.muted);
  document.text(invoice.status.toUpperCase(), titleX, 46, { align: 'right' });

  let y = 84;
  document.setFillColor(...colors.paleGold);
  document.roundedRect(margin, y, contentWidth, 29, 2, 2, 'F');
  document.setFont('helvetica', 'bold');
  document.setFontSize(8);
  document.setTextColor(...colors.gold);
  document.text('BILL TO', margin + 6, y + 8);
  document.setFontSize(12);
  document.setTextColor(...colors.ink);
  document.text(document.splitTextToSize(invoice.clientId?.name ?? 'Customer', 76), margin + 6, y + 16);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(...colors.muted);
  document.text(invoice.clientId?.phone ?? 'Mobile number not provided', margin + 6, y + 23);

  const detailsX = pageWidth - margin - 67;
  document.setFont('helvetica', 'bold');
  document.setFontSize(7.5);
  document.setTextColor(...colors.muted);
  document.text('INVOICE DATE', detailsX, y + 9);
  document.text('DUE DATE', detailsX, y + 21);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(...colors.ink);
  document.text(formatDate(invoice.invoiceDate), titleX - 6, y + 9, { align: 'right' });
  document.text(invoice.dueDate ? formatDate(invoice.dueDate) : 'On receipt', titleX - 6, y + 21, { align: 'right' });

  y += 40;
  const tableX = margin;
  const tableWidth = contentWidth;
  const itemX = tableX + 6;
  const qtyX = tableX + tableWidth - 78;
  const unitX = tableX + tableWidth - 47;
  const totalX = tableX + tableWidth - 5;
  const tableHeaderHeight = 10;
  const drawTableHeader = () => {
    document.setFillColor(...colors.ink);
    document.roundedRect(tableX, y, tableWidth, tableHeaderHeight, 1.5, 1.5, 'F');
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.5);
    document.setTextColor(...colors.white);
    document.text('ITEM DESCRIPTION', itemX, y + 6.5);
    document.text('QTY', qtyX, y + 6.5, { align: 'right' });
    document.text('UNIT PRICE', unitX, y + 6.5, { align: 'right' });
    document.text('AMOUNT', totalX, y + 6.5, { align: 'right' });
    y += tableHeaderHeight;
  };
  drawTableHeader();

  for (const item of invoice.items) {
    const garmentLines = document.splitTextToSize(item.garmentType, 87);
    const description = item.description
      ? document.splitTextToSize(item.description, 87)
      : [];
    const rowHeight = Math.max(15, garmentLines.length * 5 + description.length * 4 + 5);
    if (y + rowHeight > pageHeight - 45) {
      document.addPage();
      document.setFillColor(...colors.white);
      document.rect(0, 0, pageWidth, pageHeight, 'F');
      y = 20;
      drawTableHeader();
    }
    document.setFillColor(...colors.paleGold);
    if (invoice.items.indexOf(item) % 2 === 1) {
      document.rect(tableX, y, tableWidth, rowHeight, 'F');
    }
    document.setFont('helvetica', 'bold');
    document.setFontSize(9);
    document.setTextColor(...colors.ink);
    document.text(garmentLines, itemX, y + 6);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(...colors.muted);
    if (description.length) document.text(description, itemX, y + garmentLines.length * 5 + 6);
    document.setFontSize(8.5);
    document.setTextColor(...colors.ink);
    document.text(String(item.quantity), qtyX, y + 7, { align: 'right' });
    document.text(pdfMoney(item.unitPrice), unitX, y + 7, { align: 'right' });
    document.setFont('helvetica', 'bold');
    document.text(pdfMoney(item.total), totalX, y + 7, { align: 'right' });
    y += rowHeight;
    document.setDrawColor(...colors.line);
    document.setLineWidth(0.25);
    document.line(tableX, y, tableX + tableWidth, y);
  }

  if (y + 47 > pageHeight - 18) {
    document.addPage();
    document.setFillColor(...colors.white);
    document.rect(0, 0, pageWidth, pageHeight, 'F');
    y = 20;
  } else {
    y += 9;
  }
  const totalsWidth = 79;
  const totalsX = pageWidth - margin - totalsWidth;
  document.setFillColor(...colors.paleGold);
  document.roundedRect(totalsX, y, totalsWidth, 39, 2, 2, 'F');
  document.setDrawColor(...colors.line);
  document.roundedRect(totalsX, y, totalsWidth, 39, 2, 2, 'S');
  const totalsTextX = totalsX + 6;
  const totalsValueX = pageWidth - margin - 5;
  document.setFont('helvetica', 'normal');
  document.setFontSize(8.5);
  document.setTextColor(...colors.muted);
  document.text('Subtotal', totalsTextX, y + 9);
  document.setTextColor(...colors.ink);
  document.text(pdfMoney(invoice.subtotal), totalsValueX, y + 9, { align: 'right' });
  document.setTextColor(...colors.muted);
  document.text('Paid', totalsTextX, y + 18);
  document.setTextColor(...colors.ink);
  document.text(pdfMoney(invoice.paidAmount), totalsValueX, y + 18, { align: 'right' });
  document.setDrawColor(...colors.line);
  document.line(totalsTextX, y + 22, pageWidth - margin - 5, y + 22);
  document.setFont('helvetica', 'bold');
  document.setFontSize(9);
  document.setTextColor(...colors.gold);
  document.text('BALANCE DUE', totalsTextX, y + 32);
  document.setFontSize(10);
  document.setTextColor(...colors.ink);
  document.text(pdfMoney(invoice.balanceAmount), totalsValueX, y + 32, { align: 'right' });
  y += 47;
  if (invoice.notes) {
    document.setFont('helvetica', 'bold');
    document.setFontSize(8);
    document.setTextColor(...colors.gold);
    document.text('NOTE', margin, y);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8.5);
    document.setTextColor(...colors.muted);
    const noteLines = document.splitTextToSize(invoice.notes, contentWidth - 14);
    document.text(noteLines, margin, y + 6);
    y += 8 + noteLines.length * 4;
  }
  document.setDrawColor(...colors.line);
  document.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
  document.setFont('helvetica', 'normal');
  document.setFontSize(8);
  document.setTextColor(...colors.muted);
  document.text('Thank you for choosing Hamiz Boutique.', margin, pageHeight - 13);
  document.text('We appreciate your business.', pageWidth - margin, pageHeight - 13, { align: 'right' });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(7);
    document.setTextColor(...colors.muted);
    document.text(`${page} / ${pageCount}`, pageWidth / 2, pageHeight - 13, { align: 'center' });
  }

  return new File([document.output('blob')], `${invoice.invoiceNumber}.pdf`, {
    type: 'application/pdf',
  });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function createPaymentReceiptPdf(invoice: ReceiptInvoice, payment: InvoicePayment) {
  const document = new jsPDF();
  const pageWidth = document.internal.pageSize.getWidth();
  const margin = 18;
  const ink: [number, number, number] = [48, 43, 36];
  const muted: [number, number, number] = [119, 108, 91];
  const gold: [number, number, number] = [164, 133, 77];
  const paleGold: [number, number, number] = [247, 243, 234];
  const line: [number, number, number] = [225, 216, 199];

  const logoResponse = await fetch('/hamiz-logo.png');
  if (!logoResponse.ok) throw new Error('Boutique logo could not be loaded for the receipt.');
  const logoBlob = await logoResponse.blob();
  const logoData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Boutique logo could not be converted for the receipt.'));
    reader.onerror = () => reject(new Error('Boutique logo could not be read for the receipt.'));
    reader.readAsDataURL(logoBlob);
  });

  document.setFillColor(255, 255, 255);
  document.rect(0, 0, pageWidth, document.internal.pageSize.getHeight(), 'F');
  document.setDrawColor(...line);
  document.roundedRect(margin, 14, 43, 32, 2, 2, 'S');
  const logoProperties = document.getImageProperties(logoData);
  const logoScale = Math.min(33 / logoProperties.width, 22 / logoProperties.height);
  const logoWidth = logoProperties.width * logoScale;
  const logoHeight = logoProperties.height * logoScale;
  document.addImage(
    logoData,
    'PNG',
    margin + (43 - logoWidth) / 2,
    14 + (32 - logoHeight) / 2,
    logoWidth,
    logoHeight,
  );

  document.setFont('helvetica', 'bold');
  document.setFontSize(18);
  document.setTextColor(...ink);
  document.text('PAYMENT RECEIPT', pageWidth - margin, 25, { align: 'right' });
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(...muted);
  document.text('Hamiz Boutique', pageWidth - margin, 33, { align: 'right' });
  document.text('Randathani, Kottakkal, Kerala · +91 9526285862', pageWidth - margin, 39, { align: 'right' });
  document.text('hamizboutique@gmail.com · hamiz-boutique.netlify.app', pageWidth - margin, 45, { align: 'right' });

  document.setDrawColor(...line);
  document.line(margin, 57, pageWidth - margin, 57);
  document.setFontSize(9);
  document.setTextColor(...muted);
  document.text('RECEIPT NO.', margin, 70);
  document.text('DATE RECEIVED', pageWidth / 2, 70);
  document.setFont('helvetica', 'bold');
  document.setTextColor(...ink);
  document.text(`R-${payment._id.slice(-8).toUpperCase()}`, margin, 77);
  document.text(
    new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(payment.receivedAt)),
    pageWidth / 2,
    77,
  );

  document.setFillColor(...paleGold);
  document.roundedRect(margin, 91, pageWidth - margin * 2, 35, 3, 3, 'F');
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(...muted);
  document.text('AMOUNT RECEIVED', margin + 7, 103);
  document.setFont('helvetica', 'bold');
  document.setFontSize(21);
  document.setTextColor(...gold);
  document.text(pdfMoney(payment.amount), margin + 7, 117);

  const details = [
    ['Received from', invoice.clientId?.name ?? 'Client'],
    ['Invoice number', invoice.invoiceNumber],
    ['Payment method', payment.method.replaceAll('_', ' ')],
    ...(payment.reference ? [['Payment reference', payment.reference]] : []),
  ];
  let y = 145;
  for (const [label, value] of details) {
    document.setFont('helvetica', 'normal');
    document.setFontSize(10);
    document.setTextColor(...muted);
    document.text(label, margin, y);
    document.setFont('helvetica', 'bold');
    document.setTextColor(...ink);
    document.text(value, pageWidth - margin, y, { align: 'right' });
    document.setDrawColor(...line);
    document.line(margin, y + 5, pageWidth - margin, y + 5);
    y += 14;
  }
  if (payment.notes) {
    document.setFont('helvetica', 'normal');
    document.setFontSize(9);
    document.setTextColor(...muted);
    document.text('Notes', margin, y + 2);
    document.setTextColor(...ink);
    document.text(document.splitTextToSize(payment.notes, pageWidth - margin * 2 - 25), margin + 25, y + 2);
  }
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(...muted);
  document.text('Thank you for your payment.', margin, 270);
  document.text('Hamiz Boutique · Home Boutique by appointment', pageWidth - margin, 270, { align: 'right' });

  return new File([document.output('blob')], `Receipt-${payment._id.slice(-8).toUpperCase()}.pdf`, {
    type: 'application/pdf',
  });
}

export default function InvoiceDetailsPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [invoiceLogo, setInvoiceLogo] = useState('');
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [paymentsError, setPaymentsError] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentRefreshVersion, setPaymentRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    loadInvoiceLogo()
      .then((logo) => {
        if (active) setInvoiceLogo(logo);
      })
      .catch((cause: unknown) => {
        if (active) {
          setActionError(cause instanceof Error ? cause.message : 'Boutique logo could not be loaded for the invoice PDF.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch(`${API}/invoices/${params.id}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message = Array.isArray(body?.message)
            ? body.message.join(' ')
            : typeof body?.message === 'string'
              ? body.message
              : `Invoice could not be loaded (HTTP ${response.status}).`;
          throw new Error(message);
        }
        const data = (await response.json()) as Invoice;
        if (active) setInvoice(data);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Invoice could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params.id]);

  useEffect(() => {
    let active = true;
    apiFetch(`${API}/invoices/${params.id}/payments`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.message === 'string' ? body.message : 'Invoice payment history could not be loaded.');
        }
        const data = (await response.json()) as InvoicePayment[];
        if (active) {
          setPayments(data);
          setPaymentsError('');
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setPaymentsError(cause instanceof Error ? cause.message : 'Invoice payment history could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [params.id, paymentRefreshVersion]);

  const markAsSent = async () => {
    if (!invoice) return;
    setActionBusy(true);
    setActionError('');
    setNotice('');
    try {
      const response = await apiFetch(`${API}/invoices/${invoice._id}/send`, { method: 'PATCH' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.message === 'string' ? body.message : 'Invoice could not be marked as sent.');
      }
      const updated = (await response.json()) as Invoice;
      setInvoice((current) => current ? { ...current, ...updated, clientId: current.clientId } : current);
      setNotice('Invoice marked as sent.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Invoice could not be marked as sent.');
    } finally {
      setActionBusy(false);
    }
  };

  const whatsAppMessage = () => [
    `Hello ${invoice?.clientId?.name ?? 'Customer'},`,
    '',
    `Your invoice ${invoice?.invoiceNumber} is ready for review.`,
    `Total amount: ${money(invoice?.total ?? 0)}`,
    `Balance due: ${money(invoice?.balanceAmount ?? 0)}`,
    '',
    'Thank you for shopping with Hamiz Boutique.',
  ].join('\n');

  const shareOnWhatsApp = () => {
    if (!invoice) return;
    setActionError('');
    setNotice('');
    if (!invoiceLogo) {
      setActionError('The invoice PDF is still being prepared. Please try again in a moment.');
      return;
    }

    let file: File;
    try {
      file = createInvoicePdf(invoice, invoiceLogo);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Invoice PDF could not be created.');
      return;
    }

    const shareData: ShareData = {
      files: [file],
      title: invoice.invoiceNumber,
      text: `Hello ${invoice.clientId?.name ?? 'Customer'}, your invoice ${invoice.invoiceNumber} is attached. Total: ${money(invoice.total)}. Balance due: ${money(invoice.balanceAmount)}. Thank you for shopping with Hamiz Boutique.`,
    };
    if (navigator.share && navigator.canShare?.(shareData)) {
      setSharing(true);
      try {
        navigator.share(shareData)
          .catch((cause: unknown) => {
            if (cause instanceof Error && cause.name === 'AbortError') return;
            setActionError(cause instanceof Error ? cause.message : 'Invoice PDF could not be shared.');
          })
          .finally(() => setSharing(false));
      } catch (cause) {
        setSharing(false);
        setActionError(cause instanceof Error ? cause.message : 'Invoice PDF could not be shared.');
      }
      return;
    }

    try {
      const whatsappWindow = window.open('', '_blank');
      downloadFile(file);
      const phone = invoice.clientId?.phone?.replace(/\D/g, '') ?? '';
      const internationalPhone = phone.length === 10 ? `91${phone}` : phone;
      const base = internationalPhone
        ? `https://wa.me/${internationalPhone}`
        : 'https://wa.me/';
      const url = `${base}?text=${encodeURIComponent(whatsAppMessage())}`;
      if (whatsappWindow) whatsappWindow.location.href = url;
      else window.location.assign(url);
      setNotice('PDF downloaded. Attach it in WhatsApp before sending the message.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Invoice PDF could not be shared.');
    }
  };

  const downloadInvoice = async () => {
    if (!invoice) return;
    setActionError('');
    setNotice('');
    setActionBusy(true);
    try {
      if (!invoiceLogo) throw new Error('The invoice PDF is still being prepared. Please try again in a moment.');
      downloadFile(createInvoicePdf(invoice, invoiceLogo));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Invoice PDF could not be downloaded.');
    } finally {
      setActionBusy(false);
    }
  };

  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invoice) return;
    const paymentAmount = Number(amount);
    if (!Number.isInteger(paymentAmount) || paymentAmount < 1 || paymentAmount > invoice.balanceAmount) {
      setActionError('Enter a whole amount that does not exceed the invoice balance.');
      return;
    }

    setActionBusy(true);
    setActionError('');
    setNotice('');
    try {
      const response = await apiFetch(`${API}/invoices/${invoice._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: paymentAmount,
          method,
          reference: reference.trim() || undefined,
          receivedAt: receivedAt ? new Date(`${receivedAt}T12:00:00`).toISOString() : undefined,
          notes: paymentNotes.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : 'Invoice payment could not be recorded.';
        throw new Error(message);
      }
      setInvoice((await response.json()) as Invoice);
      setAmount('');
      setReference('');
      setPaymentNotes('');
      setPaymentRefreshVersion((version) => version + 1);
      setNotice('Payment recorded in the client ledger.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Invoice payment could not be recorded.');
    } finally {
      setActionBusy(false);
    }
  };

  const downloadPaymentReceipt = async (payment: InvoicePayment) => {
    if (!invoice) return;
    setActionBusy(true);
    setActionError('');
    setNotice('');
    try {
      const file = await createPaymentReceiptPdf(invoice, payment);
      downloadFile(file);
      setNotice(`Receipt for ${money(payment.amount)} downloaded.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Payment receipt could not be created.');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) return <main className={styles.detailPage}><Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Invoices', href: '/invoices' }, { label: 'Invoice' }]} /><p className={styles.state}>Loading invoice…</p></main>;
  if (error) return <main className={styles.detailPage}><Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Invoices', href: '/invoices' }, { label: 'Invoice' }]} /><p className={styles.state}>{error}</p></main>;
  if (!invoice) return <main className={styles.detailPage}><Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Invoices', href: '/invoices' }, { label: 'Invoice' }]} /><p className={styles.state}>Invoice not found.</p></main>;

  return (
    <main className={styles.detailPage}>
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/' }, { label: 'Invoices', href: '/invoices' }, { label: invoice.invoiceNumber }]} />
      <header className={styles.detailHeader}>
        <div className={styles.brandPad}>
          <div className={styles.brandRow}>
            <img src="/hamiz-logo.png" alt="Hamiz Boutique logo" className={styles.logo} />
            <div>
              <p className={styles.eyebrow}>Invoice</p>
              <h1 className={`${styles.title} ${styles.invoiceNumberTitle}`}>{invoice.invoiceNumber}</h1>
            </div>
          </div>
        </div>
        <div className={styles.actionsWrap}>
          {!invoice.sentAt && invoice.status !== 'paid' && (
            <button type="button" className={styles.actionButton} onClick={markAsSent} disabled={actionBusy}>
              {actionBusy ? 'Updating…' : 'Mark as sent'}
            </button>
          )}
          <button type="button" className={styles.actionButton} onClick={downloadInvoice} disabled={actionBusy || sharing}>
            {actionBusy && !sharing ? 'Preparing…' : 'Download PDF'}
          </button>
          <button type="button" className={`${styles.actionButton} ${styles.secondaryAction}`} onClick={shareOnWhatsApp} disabled={sharing || actionBusy}>
            {sharing ? 'Preparing share…' : 'Share PDF on WhatsApp'}
          </button>
          <span className={`${styles.status} ${statusTone[invoice.status] ?? styles.statusDraft}`}>
            {invoice.status}
          </span>
        </div>
      </header>
      {actionError && <p className={styles.formError} role="alert">{actionError}</p>}
      {notice && <p className={styles.successNotice} role="status">{notice}</p>}

      <section className={styles.invoiceCard}>
        <div className={styles.companyBlock}>
          <img src="/hamiz-logo.png" alt="Hamiz Boutique" className={styles.companyLogo} />
          <div>
            <strong>Hamiz Boutique</strong>
            <p>Custom tailoring · Boutique styling · Fashion craftsmanship</p>
          </div>
        </div>

        <div className={styles.clientBlock}>
          <div>
            <span className={styles.sectionLabel}>Bill to</span>
            <strong>{invoice.clientId?.name ?? 'Customer'}</strong>
            <p>
              {invoice.clientId?.phone ? `${invoice.clientId.phone} · ` : ''}
              {invoice.clientId?.email ?? ''}
              {invoice.clientId?.address ? <><br />{invoice.clientId.address}</> : ''}
            </p>
          </div>
          <div className={styles.invoiceMeta}>
            <div><span>Invoice date</span><strong>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(invoice.invoiceDate))}</strong></div>
            <div><span>Due date</span><strong>{invoice.dueDate ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(invoice.dueDate)) : 'Not set'}</strong></div>
            <div><span>Balance due</span><strong>{money(invoice.balanceAmount)}</strong></div>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={`${item.garmentType}-${index}`}>
                  <td>
                    <strong>{item.garmentType}</strong>
                    {item.description && <div>{item.description}</div>}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{money(item.unitPrice)}</td>
                  <td>{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.summaryBox}>
          <div className={styles.totals}>
            <div className={styles.totalsRow}><span>Subtotal</span><strong>{money(invoice.subtotal)}</strong></div>
            <div className={styles.totalsRow}><span>Paid</span><strong>{money(invoice.paidAmount)}</strong></div>
            <div className={styles.totalsRow}><span>Balance due</span><strong>{money(invoice.balanceAmount)}</strong></div>
            <div className={`${styles.totalsRow} ${styles.total}`}><span>Total</span><strong>{money(invoice.total)}</strong></div>
          </div>
        </div>

        {invoice.notes && <p className={styles.note}>{invoice.notes}</p>}
      </section>

      {invoice.balanceAmount > 0 && (
        <section className={styles.paymentPanel}>
          <div className={styles.paymentPanelHeading}>
            <div><p className={styles.eyebrow}>PAYMENTS</p><h2>Record invoice payment</h2></div>
            <strong>{money(invoice.balanceAmount)} due</strong>
          </div>
          <form className={styles.invoicePaymentForm} onSubmit={recordPayment}>
            <label>Amount received (₹)<input type="number" min="1" max={invoice.balanceAmount} step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label>Method<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{paymentMethods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Date received<input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></label>
            <label>Reference<input value={reference} maxLength={200} onChange={(event) => setReference(event.target.value)} placeholder="Receipt or UPI reference" /></label>
            <label className={styles.paymentNotes}>Notes<input value={paymentNotes} maxLength={1000} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Optional" /></label>
            <button type="submit" className={styles.actionButton} disabled={actionBusy || !amount}>
              {actionBusy ? 'Recording…' : 'Record payment'}
            </button>
          </form>
        </section>
      )}

      <section className={styles.paymentPanel}>
        <div className={styles.paymentPanelHeading}>
          <div><p className={styles.eyebrow}>CLIENT LEDGER</p><h2>Invoice payment history</h2></div>
          <Link href={`/clients/${invoice.clientId?._id}`} className={styles.textButton}>Client account →</Link>
        </div>
        {paymentsError ? <p className={styles.formError} role="alert">{paymentsError}</p> :
          payments.length === 0 ? <p className={styles.emptyPayments}>No payments recorded for this invoice.</p> :
            <div className={styles.invoicePaymentHistory}>
              {payments.map((payment) => (
                <article key={payment._id}>
                  <div className={styles.paymentHistoryDetails}>
                    <strong>{money(payment.amount)}</strong>
                    <span>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(payment.receivedAt))} · {payment.method.replaceAll('_', ' ')}</span>
                    {payment.reference && <span>Ref: {payment.reference}</span>}
                  </div>
                  <button
                    type="button"
                    className={styles.receiptButton}
                    onClick={() => downloadPaymentReceipt(payment)}
                    disabled={actionBusy}
                  >
                    Download receipt
                  </button>
                </article>
              ))}
            </div>}
      </section>
    </main>
  );
}
