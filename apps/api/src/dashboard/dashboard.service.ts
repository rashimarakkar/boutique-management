import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from '../orders/order.schema';

@Injectable()
export class DashboardService {
  constructor(@InjectModel(Order.name) private readonly orders: Model<OrderDocument>) {}
  async summary() {
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const active = { $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] };
    const [pending, delivered, overdue, dueToday, upcoming, accountRows] = await Promise.all([
      this.orders.countDocuments({ status: active }),
      this.orders.countDocuments({ status: OrderStatus.DELIVERED }),
      this.orders.countDocuments({ status: active, deliveryDate: { $lt: now } }),
      this.orders.countDocuments({ status: active, deliveryDate: { $gte: now, $lte: todayEnd } }),
      this.orders.find({ status: active, deliveryDate: { $gte: now } }).populate('clientId', 'name phone').sort({ deliveryDate: 1 }).limit(8).lean(),
      this.orders.aggregate([
        { $match: { status: { $ne: OrderStatus.CANCELLED } } },
        { $project: { total: { $ifNull: ['$totalAmount', 0] }, received: { $ifNull: ['$advancePaid', 0] } } },
        { $project: { total: 1, received: 1, balance: { $max: [0, { $subtract: ['$total', '$received'] }] } } },
        { $group: { _id: null, billed: { $sum: '$total' }, received: { $sum: '$received' }, pending: { $sum: '$balance' }, ordersWithPending: { $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] } } } },
      ]),
    ]);
    const accounts = accountRows[0] ?? { billed: 0, received: 0, pending: 0, ordersWithPending: 0 };
    return { pending, delivered, overdue, dueToday, upcoming, accounts };
  }
}
