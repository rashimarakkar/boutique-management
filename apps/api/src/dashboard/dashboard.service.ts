import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from '../orders/order.schema';
import { CustomerPayment, PaymentDocument } from '../payments/payment.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    @InjectModel(CustomerPayment.name) private readonly payments: Model<PaymentDocument>,
  ) {}
  async summary() {
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const active = { $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] };
    const [pending, delivered, overdue, dueToday, upcoming, accountRows, paymentRows] = await Promise.all([
      this.orders.countDocuments({ status: active }),
      this.orders.countDocuments({ status: OrderStatus.DELIVERED }),
      this.orders.countDocuments({ status: active, deliveryDate: { $lt: now } }),
      this.orders.countDocuments({ status: active, deliveryDate: { $gte: now, $lte: todayEnd } }),
      this.orders.find({ status: active, deliveryDate: { $gte: now } }).populate('clientId', 'name phone').sort({ deliveryDate: 1 }).limit(8).lean(),
      this.orders.aggregate([
        { $match: { status: { $ne: OrderStatus.CANCELLED } } },
        { $project: { total: { $ifNull: ['$totalAmount', 0] }, allocated: { $ifNull: ['$paidAmount', { $ifNull: ['$advancePaid', 0] }] } } },
        { $project: { total: 1, allocated: 1, balance: { $max: [0, { $subtract: ['$total', '$allocated'] }] } } },
        { $group: { _id: null, billed: { $sum: '$total' }, allocated: { $sum: '$allocated' }, pending: { $sum: '$balance' }, ordersWithPending: { $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] } } } },
      ]),
      this.payments.aggregate([
        {
          $project: {
            amount: 1,
            allocated: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$allocations', []] },
                  as: 'allocation',
                  in: {
                    $subtract: [
                      '$$allocation.amount',
                      {
                        $sum: {
                          $map: {
                            input: { $ifNull: ['$$allocation.reversals', []] },
                            as: 'reversal',
                            in: '$$reversal.amount',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            received: { $sum: '$amount' },
            allocated: { $sum: '$allocated' },
          },
        },
      ]),
    ]);
    const orderAccounts = accountRows[0] ?? { billed: 0, allocated: 0, pending: 0, ordersWithPending: 0 };
    const paymentTotals = paymentRows[0] ?? { received: 0, allocated: 0 };
    const unallocated = Math.max(0, paymentTotals.received - paymentTotals.allocated);
    const accounts = {
      billed: orderAccounts.billed,
      received: orderAccounts.allocated + unallocated,
      pending: orderAccounts.pending,
      ordersWithPending: orderAccounts.ordersWithPending,
      unallocated,
    };
    return { pending, delivered, overdue, dueToday, upcoming, accounts };
  }
}
