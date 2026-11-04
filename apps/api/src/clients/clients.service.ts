import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './client.schema';
import { CreateClientDto } from './dto';
import { Order, OrderDocument, OrderStatus } from '../orders/order.schema';
import { ListClientsQueryDto } from './list-clients-query.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly model: Model<ClientDocument>,
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
  ) {}
  create(dto: CreateClientDto) { return this.model.create(dto); }
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
          advancePaid: 1,
        })
        .sort({ deliveryDate: -1, _id: -1 })
        .toArray(),
      this.orders.aggregate<{
        totalBilled: number;
        totalCollected: number;
        totalDue: number;
      }>([
        { $match: { clientId: { $in: clientIds }, status: { $ne: OrderStatus.CANCELLED } } },
        {
          $group: {
            _id: null,
            totalBilled: { $sum: { $ifNull: ['$totalAmount', 0] } },
            totalCollected: { $sum: { $ifNull: ['$advancePaid', 0] } },
            totalDue: {
              $sum: {
                $max: [
                  0,
                  {
                    $subtract: [
                      { $ifNull: ['$totalAmount', 0] },
                      { $ifNull: ['$advancePaid', 0] },
                    ],
                  },
                ],
              },
            },
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
