import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from '../orders/order.schema';
import { CustomerPayment, PaymentDocument } from '../payments/payment.schema';
import { Expense, ExpenseDocument } from '../expenses/expense.schema';
import { Invoice, InvoiceDocument } from '../invoices/invoice.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    @InjectModel(CustomerPayment.name) private readonly payments: Model<PaymentDocument>,
    @InjectModel(Expense.name) private readonly expenses: Model<ExpenseDocument>,
    @InjectModel(Invoice.name) private readonly invoices: Model<InvoiceDocument>,
  ) {}
  async summary() {
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const active = { $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] };
    const [pending, delivered, overdue, dueToday, upcoming, invoiceRows, paymentRows, expenseRows] = await Promise.all([
      this.orders.countDocuments({ status: active }),
      this.orders.countDocuments({ status: OrderStatus.DELIVERED }),
      this.orders.countDocuments({ status: active, deliveryDate: { $lt: now } }),
      this.orders.countDocuments({ status: active, deliveryDate: { $gte: now, $lte: todayEnd } }),
      this.orders.find({ status: active, deliveryDate: { $gte: now } }).populate('clientId', 'name phone').sort({ deliveryDate: 1 }).limit(8).lean(),
      this.invoices.aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            billed: { $sum: '$total' },
            received: { $sum: '$paidAmount' },
            pending: { $sum: '$balanceAmount' },
            invoicesWithPending: { $sum: { $cond: [{ $gt: ['$balanceAmount', 0] }, 1, 0] } },
          },
        },
      ]),
      this.payments.aggregate([
        { $group: { _id: null, received: { $sum: '$amount' } } },
      ]),
      this.expenses.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const invoiceAccounts = invoiceRows[0] ?? { count: 0, billed: 0, received: 0, pending: 0, invoicesWithPending: 0 };
    const paymentTotals = paymentRows[0] ?? { received: 0 };
    const accounts = {
      billed: invoiceAccounts.billed,
      received: invoiceAccounts.received,
      pending: invoiceAccounts.pending,
      invoicesWithPending: invoiceAccounts.invoicesWithPending,
    };
    return {
      pending,
      delivered,
      overdue,
      dueToday,
      invoices: invoiceAccounts.count,
      upcoming,
      accounts,
      expenses: { total: expenseRows[0]?.total ?? 0 },
      cashProfit: paymentTotals.received - (expenseRows[0]?.total ?? 0),
    };
  }
}
