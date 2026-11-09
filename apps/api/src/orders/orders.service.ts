import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateOrderDto, UpdateOrderDto } from './dto';
import { Order, OrderDocument } from './order.schema';
import { Client, ClientDocument } from '../clients/client.schema';
import { OrderStatus } from './order.schema';
import { ListOrdersQueryDto } from './list-orders-query.dto';
import { GarmentType, GarmentTypeDocument } from './garment-type.schema';
import { OrderMediaStorage } from './order-media.storage';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly model: Model<OrderDocument>,
    @InjectModel(Client.name) private readonly clients: Model<ClientDocument>,
    @InjectModel(GarmentType.name) private readonly garmentTypes: Model<GarmentTypeDocument>,
    private readonly mediaStorage: OrderMediaStorage,
    private readonly paymentsService: PaymentsService,
  ) {}
  async create(dto: CreateOrderDto) {
    const order = new this.model({
      ...dto,
      advancePaid: 0,
      paidAmount: 0,
      legacyPaidAmount: 0,
    });
    const media = await this.mediaStorage.persistOrderMedia(
      order._id.toString(),
      dto.imageUrls ?? [],
      dto.sketchUrl,
    );
    order.imageUrls = media.imageUrls;
    if (media.sketchUrl !== undefined && media.sketchUrl !== null) {
      order.sketchUrl = media.sketchUrl;
    }
    try {
      if ((dto.advancePaid ?? 0) > 0) {
        const saved = await this.paymentsService.createOrderWithLegacyAdvance(order, dto.advancePaid!);
        return this.withFinancialAmounts(saved.toObject());
      }
      const saved = await order.save();
      return this.withFinancialAmounts(saved.toObject());
    } catch (error) {
      await this.mediaStorage.removeFiles(media.createdFiles);
      throw error;
    }
  }
  async findGarmentTypes() {
    const [orderTypes, savedTypes] = await Promise.all([
      this.model.distinct('garmentType').exec(),
      this.garmentTypes.find().sort({ name: 1 }).lean(),
    ]);
    return [...new Set([...orderTypes, ...savedTypes.map((type) => type.name)].filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }
  async createGarmentType(name: string) {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) throw new BadRequestException('Garment type cannot be empty');
    try {
      const type = await this.garmentTypes.create({
        name: name.trim(),
        normalizedName,
      });
      return { name: type.name };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        const existing = await this.garmentTypes.findOne({ normalizedName }).lean();
        return { name: existing?.name ?? name.trim() };
      }
      throw error;
    }
  }
  async findAll(query: ListOrdersQueryDto): Promise<{
    data: Array<Record<string, unknown>>;
    total: number;
    skip: number;
    limit: number;
  }> {
    const { status, view, q, skip = 0, limit = 20 } = query;
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const active = { $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] };
    const filter: Record<string, unknown> = status ? { status } : {};
    if (!status) {
      if (view === 'pending') filter.status = active;
      if (view === 'delivered') filter.status = OrderStatus.DELIVERED;
      if (view === 'overdue') { filter.status = active; filter.deliveryDate = { $lt: now }; }
      if (view === 'due_today') { filter.status = active; filter.deliveryDate = { $gte: now, $lte: todayEnd }; }
      if (view === 'payment_due') filter.$expr = {
        $gt: [
          { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$paidAmount', { $ifNull: ['$advancePaid', 0] }] }] },
          0,
        ],
      };
      if (view === 'received') filter.$expr = { $gt: [{ $ifNull: ['$paidAmount', { $ifNull: ['$advancePaid', 0] }] }, 0] };
    }
    if (q?.trim()) {
      const term = q.trim(); const match = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const clientMatches = await this.clients.find({ $or: [{ name: match }, { phone: match }] }, { _id: 1 }).lean();
      const options: Record<string, unknown>[] = [{ garmentType: match }];
      if (Types.ObjectId.isValid(term)) options.push({ _id: new Types.ObjectId(term) });
      if (clientMatches.length) options.push({ clientId: { $in: clientMatches.map(client => client._id) } });
      filter.$and = [...((filter.$and as Record<string, unknown>[]) ?? []), { $or: options }];
    }
    const [data, total] = await Promise.all([
      this.model.find(filter).populate('clientId', 'name phone')
        .sort({ deliveryDate: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((order) => this.withFinancialAmounts(order)),
      total,
      skip,
      limit,
    };
  }
  async findOne(id: string): Promise<Record<string, unknown>> {
    const order = await this.model.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');
    const media = await this.mediaStorage.persistOrderMedia(
      order._id.toString(),
      order.imageUrls ?? [],
      order.sketchUrl,
    );
    const mediaChanged =
      JSON.stringify(order.imageUrls ?? []) !== JSON.stringify(media.imageUrls) ||
      order.sketchUrl !== media.sketchUrl;
    if (mediaChanged) {
      await this.model.findByIdAndUpdate(order._id, {
        imageUrls: media.imageUrls,
        sketchUrl: media.sketchUrl,
      }).exec();
      await this.mediaStorage.removeUnreferencedFiles(order._id.toString(), [
        ...media.imageUrls,
        ...(media.sketchUrl ? [media.sketchUrl] : []),
      ]);
    }
    const result = await this.model.findById(id)
      .populate('clientId', 'name phone email address notes')
      .lean();
    if (!result) throw new NotFoundException('Order not found');
    return this.withFinancialAmounts(result);
  }
  async update(id: string, dto: UpdateOrderDto) {
    const existing = await this.model.findById(id).exec();
    if (!existing) throw new NotFoundException('Order not found');
    const paidAmount = existing.paidAmount ?? existing.advancePaid ?? 0;
    if (dto.totalAmount !== undefined && dto.totalAmount < paidAmount) {
      throw new BadRequestException('Order total cannot be less than the amount already paid');
    }
    if (dto.advancePaid !== undefined) {
      await this.paymentsService.recordLegacyOrderAdvance(id, dto.advancePaid);
    }
    const media = await this.mediaStorage.persistOrderMedia(
      existing._id.toString(),
      dto.imageUrls ?? existing.imageUrls ?? [],
      dto.sketchUrl === undefined ? existing.sketchUrl : dto.sketchUrl,
    );
    const { advancePaid: _legacyAdvancePaid, ...orderFields } = dto;
    const filter: Record<string, unknown> = { _id: id };
    if (dto.totalAmount !== undefined) {
      filter.$or = [
        { paidAmount: { $lte: dto.totalAmount } },
        { paidAmount: { $exists: false }, advancePaid: { $lte: dto.totalAmount } },
        { paidAmount: null, advancePaid: { $lte: dto.totalAmount } },
        { paidAmount: { $exists: false }, advancePaid: { $exists: false } },
        { paidAmount: null, advancePaid: { $exists: false } },
      ];
    }
    const order = await this.model.findOneAndUpdate(
      filter,
      {
        ...orderFields,
        imageUrls: media.imageUrls,
        sketchUrl: media.sketchUrl,
      },
      { new: true, runValidators: true },
    );
    if (!order) {
      await this.mediaStorage.removeFiles(media.createdFiles);
      if (dto.totalAmount !== undefined && await this.model.exists({ _id: id })) {
        throw new ConflictException('Order total cannot be less than the amount already paid');
      }
      throw new NotFoundException('Order not found');
    }
    await this.mediaStorage.removeUnreferencedFiles(order._id.toString(), [
      ...media.imageUrls,
      ...(media.sketchUrl ? [media.sketchUrl] : []),
    ]);
    return this.withFinancialAmounts(order.toObject());
  }

  async remove(id: string) {
    const existing = await this.model.findById(id).exec();
    if (!existing) throw new NotFoundException('Order not found');
    if (
      (existing.paidAmount ?? existing.advancePaid ?? 0) > 0 ||
      await this.paymentsService.hasAllocations(id)
    ) {
      throw new ConflictException('This order has payment history and cannot be deleted.');
    }
    const order = await this.model.findByIdAndDelete(id).exec();
    if (!order) throw new NotFoundException('Order not found');

    try {
      await this.mediaStorage.removeOrderFiles(order._id.toString());
      return { deleted: true };
    } catch (error) {
      this.logger.error(
        `Order ${order._id.toString()} was deleted, but its media files could not be removed`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        deleted: true,
        warning: 'The order was deleted, but its photo and sketch files could not be removed.',
      };
    }
  }

  async getMedia(orderId: string, fileName: string) {
    const order = await this.model.findById(orderId).select('imageUrls sketchUrl').lean();
    if (!order) throw new NotFoundException('Media not found');
    const mediaPath = `/api/orders/${orderId}/media/${fileName}`;
    if (!order.imageUrls?.includes(mediaPath) && order.sketchUrl !== mediaPath) {
      throw new NotFoundException('Media not found');
    }
    return this.mediaStorage.readMedia(orderId, fileName);
  }

  private withFinancialAmounts<
    T extends { totalAmount?: number; advancePaid?: number; paidAmount?: number },
  >(order: T): T & { paidAmount: number; balanceAmount: number } {
    const paidAmount = order.paidAmount ?? order.advancePaid ?? 0;
    return {
      ...order,
      paidAmount,
      balanceAmount: Math.max(0, (order.totalAmount ?? 0) - paidAmount),
    };
  }
}
