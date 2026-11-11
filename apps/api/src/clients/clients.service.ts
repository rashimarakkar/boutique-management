import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './client.schema';
import { CreateClientDto, UpdateClientDto } from './dto';
import { Order, OrderDocument, OrderStatus } from '../orders/order.schema';
import { ListClientsQueryDto } from './list-clients-query.dto';
import { CustomerPayment, PaymentDocument } from '../payments/payment.schema';
import { Invoice, InvoiceDocument } from '../invoices/invoice.schema';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly model: Model<ClientDocument>,
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    @InjectModel(CustomerPayment.name) private readonly payments: Model<PaymentDocument>,
    @InjectModel(Invoice.name) private readonly invoices: Model<InvoiceDocument>,
  ) {}
  create(dto: CreateClientDto) { return this.model.create(dto); }
  async update(id: string, dto: UpdateClientDto) {
    const name = dto.name.trim();
    const phone = dto.phone.trim();
    if (!name || !phone) {
      throw new BadRequestException('Client name and mobile number are required');
    }
    const client = await this.model.findByIdAndUpdate(
      id,
      { name, phone },
      { new: true, runValidators: true },
    ).lean();
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }
  findAll(query = '') {
    const term = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = term ? new RegExp(term, 'i') : null;
    const filter = match ? { $or: [{ name: match }, { phone: match }] } : {};
    return this.model.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  }
  async findAllPaged(query: ListClientsQueryDto) {
    const { q = '', skip = 0, limit = 20 } = query;
    const term = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = term ? new RegExp(term, 'i') : null;
    const filter = match ? { $or: [{ name: match }, { phone: match }] } : {};
    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { data, total, skip, limit };
  }
  async findOne(id: string) {
    const client = await this.model.findById(id).lean();
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async remove(id: string) {
    const client = await this.findOne(id);
    const hasOrders = await this.orders.exists({
      clientId: { $in: [client._id, client._id.toString()] },
    });
    if (hasOrders) {
      throw new ConflictException('This client has existing orders. Delete the orders before deleting this client.');
    }
    if (await this.payments.exists({ clientId: client._id })) {
      throw new ConflictException('This client has payment history and cannot be deleted.');
    }

    await this.model.findByIdAndDelete(id).exec();
    return { deleted: true };
  }

  async getSummary(id: string) {
    const client = await this.findOne(id);
    const clientIds = [client._id, client._id.toString()];
    const [orders, financialRows, statusRows] = await Promise.all([
      this.orders.collection.find({ clientId: { $in: clientIds } })
        .project({
          _id: 1,
          garmentType: 1,
          deliveryDate: 1,
          status: 1,
          totalAmount: 1,
        })
        .sort({ deliveryDate: -1, _id: -1 })
        .toArray(),
      this.invoices.aggregate<{
        totalBilled: number;
        totalCollected: number;
        totalDue: number;
      }>([
        { $match: { clientId: client._id } },
        {
          $group: {
            _id: null,
            totalBilled: { $sum: '$total' },
            totalCollected: { $sum: '$paidAmount' },
            totalDue: { $sum: '$balanceAmount' },
          },
        },
      ]),
      this.orders.aggregate<{ _id: OrderStatus; count: number }>([
        { $match: { clientId: { $in: clientIds } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statuses = Object.fromEntries(
      Object.values(OrderStatus).map((status) => [status, 0]),
    ) as Record<OrderStatus, number>;
    for (const row of statusRows) statuses[row._id] = row.count;

    return {
      client,
      orders,
      summary: {
        totalOrders: orders.length,
        totalBilled: financialRows[0]?.totalBilled ?? 0,
        totalCollected: financialRows[0]?.totalCollected ?? 0,
        totalDue: financialRows[0]?.totalDue ?? 0,
        statuses,
      },
    };
  }
}
