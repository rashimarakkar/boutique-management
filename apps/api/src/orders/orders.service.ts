import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateOrderDto, UpdateOrderDto } from './dto';
import { Order, OrderDocument } from './order.schema';
import { Client, ClientDocument } from '../clients/client.schema';
import { OrderStatus } from './order.schema';

@Injectable()
export class OrdersService {
  constructor(@InjectModel(Order.name) private readonly model: Model<OrderDocument>, @InjectModel(Client.name) private readonly clients: Model<ClientDocument>) {}
  create(dto: CreateOrderDto) { return this.model.create(dto); }
  async findAll(status?: string, view?: string, query?: string) {
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const active = { $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] };
    const filter: Record<string, unknown> = status ? { status } : {};
    if (!status) {
      if (view === 'pending') filter.status = active;
      if (view === 'delivered') filter.status = OrderStatus.DELIVERED;
      if (view === 'overdue') { filter.status = active; filter.deliveryDate = { $lt: now }; }
      if (view === 'due_today') { filter.status = active; filter.deliveryDate = { $gte: now, $lte: todayEnd }; }
      if (view === 'payment_due') filter.$expr = { $gt: [{ $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$advancePaid', 0] }] }, 0] };
      if (view === 'received') filter.advancePaid = { $gt: 0 };
    }
    if (query?.trim()) {
      const term = query.trim(); const match = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const clientMatches = await this.clients.find({ $or: [{ name: match }, { phone: match }] }, { _id: 1 }).lean();
      const options: Record<string, unknown>[] = [{ garmentType: match }];
      if (Types.ObjectId.isValid(term)) options.push({ _id: new Types.ObjectId(term) });
      if (clientMatches.length) options.push({ clientId: { $in: clientMatches.map(client => client._id) } });
      filter.$and = [...((filter.$and as Record<string, unknown>[]) ?? []), { $or: options }];
    }
    return this.model.find(filter).populate('clientId', 'name phone').sort({ deliveryDate: 1 }).lean();
  }
  async findOne(id: string) {
    const order = await this.model.findById(id).populate('clientId', 'name phone email address notes').lean();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
  async update(id: string, dto: UpdateOrderDto) {
    const order = await this.model.findByIdAndUpdate(id, dto, { new: true, runValidators: true });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
