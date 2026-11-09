import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../clients/client.schema';
import { Order, OrderDocument, OrderStatus } from '../orders/order.schema';
import { AddPaymentAllocationsDto, CreatePaymentDto, PaymentAllocationDto } from './dto';
import {
  CustomerPayment,
  PaymentDocument,
  PaymentMethod,
  PaymentSource,
} from './payment.schema';
import {
  assertAllocationAllowed,
  assertAllocationWithinAvailable,
  allocationFingerprint,
  getUnallocatedAmount,
  paymentFingerprint,
  validateAllocations,
} from './payment.utils';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(CustomerPayment.name) private readonly payments: Model<PaymentDocument>,
    @InjectModel(Client.name) private readonly clients: Model<ClientDocument>,
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
  ) {}

  async createOrderWithLegacyAdvance(order: OrderDocument, amount: number) {
    const session = await this.connection.startSession();
    let savedOrder: OrderDocument | undefined;
    try {
      await session.withTransaction(async () => {
        if (!(await this.clients.exists({ _id: order.clientId }).session(session))) {
          throw new NotFoundException('Client not found');
        }
        const orderToSave = new this.orders(order.toObject());
        assertAllocationAllowed({
          amount,
          totalAmount: orderToSave.totalAmount,
          paidAmount: 0,
          sameCustomer: true,
          cancelled: false,
          orderLabel: orderToSave.garmentType,
        });

        orderToSave.advancePaid = amount;
        orderToSave.paidAmount = amount;
        orderToSave.legacyPaidAmount = 0;
        savedOrder = await orderToSave.save({ session });

        const payment = new this.payments({
          clientId: orderToSave.clientId,
          amount,
          method: PaymentMethod.CASH,
          reference: 'Legacy order payment update',
          notes: 'Recorded from the existing order advance field',
          receivedAt: new Date(),
          idempotencyKey: `legacy-create-${orderToSave._id.toString()}`,
          requestFingerprint: paymentFingerprint({
            amount,
            method: PaymentMethod.CASH,
            reference: 'Legacy order payment update',
            notes: 'Recorded from the existing order advance field',
            allocations: [{ orderId: orderToSave._id.toString(), amount }],
          }),
          allocations: [{
            orderId: orderToSave._id,
            amount,
            allocatedAt: new Date(),
            notes: 'Recorded from the existing order advance field',
            reversals: [],
          }],
        });
        await payment.save({ session });
      });
    } finally {
      await session.endSession();
    }
    if (!savedOrder) throw new ConflictException('Order payment could not be recorded');
    return savedOrder;
  }

  async create(clientId: string, dto: CreatePaymentDto, createdBy?: string) {
    const clientObjectId = this.toObjectId(clientId, 'Client');
    const allocations = dto.allocations ?? [];
    validateAllocations(allocations);
    this.validateAllocationTotal(dto.amount, allocations);
    const fingerprint = paymentFingerprint(dto);

    const existing = await this.payments.findOne({
      clientId: clientObjectId,
      idempotencyKey: dto.idempotencyKey,
    }).exec();
    if (existing) return this.returnIdempotent(existing.toObject(), fingerprint);

    const session = await this.connection.startSession();
    let result: PaymentDocument | undefined;
    let idempotent = false;
    try {
      await session.withTransaction(async () => {
        result = undefined;
        idempotent = false;
        if (!(await this.clients.exists({ _id: clientObjectId }).session(session))) {
          throw new NotFoundException('Client not found');
        }

        const duplicate = await this.payments.findOne({
          clientId: clientObjectId,
          idempotencyKey: dto.idempotencyKey,
        }).session(session).exec();
        if (duplicate) {
          result = duplicate;
          idempotent = true;
          return;
        }

        const orderRecords = await this.loadEligibleOrders(
          clientObjectId,
          allocations,
          session,
        );
        const payment = new this.payments({
          clientId: clientObjectId,
          amount: dto.amount,
          method: dto.method ?? PaymentMethod.CASH,
          reference: dto.reference?.trim(),
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
          notes: dto.notes?.trim(),
          idempotencyKey: dto.idempotencyKey,
          requestFingerprint: fingerprint,
          createdBy,
          allocations: [],
        });
        await this.applyAllocations(orderRecords, allocations, createdBy, payment, session);
        result = await payment.save({ session });
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const duplicate = await this.payments.findOne({
          clientId: clientObjectId,
          idempotencyKey: dto.idempotencyKey,
        }).exec();
        if (duplicate) return this.returnIdempotent(duplicate.toObject(), fingerprint);
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (!result) throw new ConflictException('Payment could not be recorded');
    return idempotent
      ? this.returnIdempotent(result.toObject(), fingerprint)
      : this.withUnallocated(result.toObject());
  }

  async addAllocations(paymentId: string, dto: AddPaymentAllocationsDto, allocatedBy?: string) {
    const paymentObjectId = this.toObjectId(paymentId, 'Payment');
    validateAllocations(dto.allocations);
    const fingerprint = allocationFingerprint(dto.allocations);
    const session = await this.connection.startSession();
    let result: PaymentDocument | undefined;
    try {
      await session.withTransaction(async () => {
        result = undefined;
        const payment = await this.payments.findById(paymentObjectId).session(session).exec();
        if (!payment) throw new NotFoundException('Payment not found');

        const previousRequest = payment.allocationRequests.find(
          (request) => request.idempotencyKey === dto.idempotencyKey,
        );
        if (previousRequest) {
          if (previousRequest.requestFingerprint !== fingerprint) {
            throw new ConflictException(
              'This allocation idempotency key was already used for a different request',
            );
          }
          result = payment;
          return;
        }

        const available = getUnallocatedAmount(payment.amount, payment.allocations);
        const requested = dto.allocations.reduce((sum, item) => sum + item.amount, 0);
        if (requested > available) {
          throw new BadRequestException('Allocations exceed the unallocated payment amount');
        }

        const orderRecords = await this.loadEligibleOrders(
          payment.clientId,
          dto.allocations,
          session,
        );
        await this.applyAllocations(
          orderRecords,
          dto.allocations,
          allocatedBy,
          payment,
          session,
        );
        payment.allocationRequests.push({
          idempotencyKey: dto.idempotencyKey,
          requestFingerprint: fingerprint,
          createdAt: new Date(),
        });
        result = await payment.save({ session });
      });
    } finally {
      await session.endSession();
    }
    if (!result) throw new ConflictException('Payment allocation could not be saved');
    return this.withUnallocated(result.toObject());
  }

  async findByClient(clientId: string) {
    const clientObjectId = this.toObjectId(clientId, 'Client');
    if (!(await this.clients.exists({ _id: clientObjectId }))) {
      throw new NotFoundException('Client not found');
    }
    const legacyOrders = await this.orders.find({
      clientId: clientObjectId,
      legacyPaidAmount: { $exists: false },
    }).select('_id').lean().exec();
    for (const order of legacyOrders) {
      await this.importLegacyAdvance(order._id.toString());
    }
    const payments = await this.payments.find({ clientId: clientObjectId })
      .sort({ receivedAt: -1, _id: -1 }).lean().exec();
    return payments.map((payment) => this.withUnallocated(payment));
  }

  async findByOrder(orderId: string): Promise<Array<Record<string, unknown>>> {
    const orderObjectId = this.toObjectId(orderId, 'Order');
    if (!(await this.orders.exists({ _id: orderObjectId }))) {
      throw new NotFoundException('Order not found');
    }
    await this.importLegacyAdvance(orderObjectId.toString());
    const payments = await this.payments.find({ 'allocations.orderId': orderObjectId })
      .sort({ receivedAt: -1, _id: -1 }).lean().exec();
    return payments.map((payment): Record<string, unknown> => ({
      ...this.withUnallocated(payment),
      allocations: payment.allocations.filter(
        (allocation) => allocation.orderId.toString() === orderObjectId.toString(),
      ),
    }));
  }

  async recordLegacyOrderAdvance(orderId: string, targetPaidAmount: number) {
    const orderObjectId = this.toObjectId(orderId, 'Order');
    const order = await this.orders.findById(orderObjectId).exec();
    if (!order) throw new NotFoundException('Order not found');
    const currentPaidAmount = order.paidAmount ?? order.advancePaid ?? 0;
    if (targetPaidAmount > currentPaidAmount) {
      const amount = targetPaidAmount - currentPaidAmount;
      await this.create(order.clientId.toString(), {
        amount,
        method: PaymentMethod.CASH,
        reference: 'Legacy order payment update',
        notes: 'Recorded from the existing order payment field',
        idempotencyKey: `legacy-${order._id.toString()}-${currentPaidAmount}-${targetPaidAmount}`,
        allocations: [{ orderId: order._id.toString(), amount }],
      });
      return this.orders.findById(orderObjectId).exec();
    }

    if (targetPaidAmount === currentPaidAmount) return order;
    const session = await this.connection.startSession();
    let updatedOrder: OrderDocument | null = null;
    try {
      await session.withTransaction(async () => {
        const currentOrder = await this.orders.findById(orderObjectId).session(session).exec();
        if (!currentOrder) throw new NotFoundException('Order not found');
        await this.importLegacyAdvanceInTransaction(currentOrder, session);
        const currentPaid = currentOrder.paidAmount ?? currentOrder.advancePaid ?? 0;
        const toReverse = currentPaid - targetPaidAmount;
        if (toReverse <= 0) {
          updatedOrder = currentOrder;
          return;
        }

        const payments = await this.payments.find({
          'allocations.orderId': orderObjectId,
        }).sort({ receivedAt: -1, _id: -1 }).session(session).exec();
        let remaining = toReverse;
        for (const payment of payments) {
          let changed = false;
          for (const allocation of payment.allocations) {
            if (!allocation.orderId.equals(orderObjectId) || remaining <= 0) continue;
            const alreadyReversed = (allocation.reversals ?? []).reduce(
              (sum, reversal) => sum + reversal.amount,
              0,
            );
            const reversible = allocation.amount - alreadyReversed;
            if (reversible <= 0) continue;
            const amount = Math.min(remaining, reversible);
            allocation.reversals.push({
              amount,
              reversedAt: new Date(),
              reason: 'Corrected through the existing order payment field',
              reversedBy: 'legacy-order-update',
            });
            remaining -= amount;
            changed = true;
          }
          if (changed) await payment.save({ session });
          if (remaining <= 0) break;
        }
        if (remaining > 0) {
          throw new ConflictException('Payment allocations do not match the order paid amount');
        }
        currentOrder.paidAmount = targetPaidAmount;
        currentOrder.advancePaid = targetPaidAmount;
        currentOrder.legacyPaidAmount = 0;
        updatedOrder = await currentOrder.save({ session });
      });
    } finally {
      await session.endSession();
    }
    if (!updatedOrder) throw new ConflictException('Order payment adjustment could not be saved');
    return updatedOrder;
  }

  async hasAllocations(orderId: string) {
    const orderObjectId = this.toObjectId(orderId, 'Order');
    return Boolean(await this.payments.exists({ 'allocations.orderId': orderObjectId }));
  }

  private async loadEligibleOrders(
    clientId: Types.ObjectId,
    allocations: readonly PaymentAllocationDto[],
    session: ClientSession,
  ) {
    if (!allocations.length) return [];
    const ids = allocations.map((allocation) => this.toObjectId(allocation.orderId, 'Order'));
    const orders = await this.orders.find({ _id: { $in: ids } }).session(session).exec();
    if (orders.length !== ids.length) {
      throw new NotFoundException('One or more orders were not found');
    }

    const byId = new Map(orders.map((order) => [order._id.toString().toLowerCase(), order]));
    for (const allocation of allocations) {
      const order = byId.get(allocation.orderId.toLowerCase());
      if (!order) throw new NotFoundException('Order not found');
      await this.importLegacyAdvanceInTransaction(order, session);
      const paid = order.paidAmount ?? order.advancePaid ?? 0;
      assertAllocationAllowed({
        amount: allocation.amount,
        totalAmount: order.totalAmount,
        paidAmount: paid,
        sameCustomer: order.clientId.toString() === clientId.toString(),
        cancelled: order.status === OrderStatus.CANCELLED,
        orderLabel: order.garmentType,
      });
    }
    return orders;
  }

  private async applyAllocations(
    orders: OrderDocument[],
    allocations: readonly PaymentAllocationDto[],
    allocatedBy: string | undefined,
    payment: PaymentDocument,
    session: ClientSession,
  ) {
    const ordersById = new Map(orders.map((order) => [order._id.toString().toLowerCase(), order]));
    for (const allocation of allocations) {
      const order = ordersById.get(allocation.orderId.toLowerCase());
      if (!order) throw new NotFoundException('Order not found');
      const paidAmount = (order.paidAmount ?? order.advancePaid ?? 0) + allocation.amount;
      order.paidAmount = paidAmount;
      order.advancePaid = paidAmount;
      order.legacyPaidAmount = 0;
      payment.allocations.push({
        orderId: order._id,
        amount: allocation.amount,
        allocatedAt: new Date(),
        notes: allocation.notes?.trim(),
        allocatedBy,
        reversals: [],
      });
      await order.save({ session });
    }
  }

  private async importLegacyAdvance(orderId: string) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await this.orders.findById(orderId).session(session).exec();
        if (!order) throw new NotFoundException('Order not found');
        await this.importLegacyAdvanceInTransaction(order, session);
      });
    } finally {
      await session.endSession();
    }
  }

  private async importLegacyAdvanceInTransaction(order: OrderDocument, session: ClientSession) {
    if (order.legacyPaidAmount !== undefined) return;
    const legacyAmount = order.paidAmount ?? order.advancePaid ?? 0;
    if (legacyAmount > 0) {
      const idempotencyKey = `legacy-import-${order._id.toString()}`;
      const fingerprint = paymentFingerprint({
        amount: legacyAmount,
        method: PaymentMethod.CASH,
        reference: 'Legacy payment import',
        allocations: [{ orderId: order._id.toString(), amount: legacyAmount }],
      });
      const existing = await this.payments.findOne({
        clientId: order.clientId,
        idempotencyKey,
      }).session(session).exec();
      if (!existing) {
        const payment = new this.payments({
          clientId: order.clientId,
          amount: legacyAmount,
          method: PaymentMethod.CASH,
          reference: 'Legacy payment import',
          notes: 'Imported from the existing order advance amount',
          receivedAt: order.createdAt ?? new Date(),
          idempotencyKey,
          requestFingerprint: fingerprint,
          source: PaymentSource.LEGACY_IMPORT,
          allocations: [{
            orderId: order._id,
            amount: legacyAmount,
            allocatedAt: order.createdAt ?? new Date(),
          }],
        });
        await payment.save({ session });
      }
    }
    order.paidAmount = legacyAmount;
    order.legacyPaidAmount = 0;
    await order.save({ session });
  }

  private validateAllocationTotal(amount: number, allocations: readonly PaymentAllocationDto[]) {
    assertAllocationWithinAvailable(amount, allocations);
  }

  private returnIdempotent(
    payment: { _id: Types.ObjectId; requestFingerprint: string } & {
      amount: number;
      allocations: readonly { amount: number }[];
    },
    fingerprint: string,
  ) {
    if (payment.requestFingerprint !== fingerprint) {
      throw new ConflictException('This idempotency key was already used for a different payment');
    }
    return this.withUnallocated(payment);
  }

  private withUnallocated<
    T extends { amount: number; allocations: readonly { amount: number }[] },
  >(payment: T): T & { unallocatedAmount: number } {
    return {
      ...payment,
      unallocatedAmount: getUnallocatedAmount(payment.amount, payment.allocations),
    };
  }

  private toObjectId(value: string, entity: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${entity} id is invalid`);
    }
    return new Types.ObjectId(value);
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
