import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../clients/client.schema';
import { Order, OrderDocument } from '../orders/order.schema';
import { CustomerPayment, PaymentDocument, PaymentMethod } from '../payments/payment.schema';
import { paymentFingerprint } from '../payments/payment.utils';
import { CreateInvoiceDto, InvoiceItemDto, ListInvoicesQueryDto, RecordInvoicePaymentDto } from './dto';
import { InvoiceCounter, InvoiceCounterDocument } from './invoice-counter.schema';
import { Invoice, InvoiceDocument, InvoiceStatus } from './invoice.schema';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InvoiceCounter.name) private readonly counterModel: Model<InvoiceCounterDocument>,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(CustomerPayment.name) private readonly paymentModel: Model<PaymentDocument>,
  ) {}

  private getStatus(invoice: {
    paidAmount: number;
    balanceAmount: number;
    dueDate?: Date;
    sentAt?: Date;
  }, now = new Date()): InvoiceStatus {
    if (invoice.balanceAmount <= 0) return 'paid';
    const dueDateEnd = invoice.dueDate ? new Date(invoice.dueDate) : undefined;
    dueDateEnd?.setUTCHours(23, 59, 59, 999);
    if (invoice.sentAt && dueDateEnd && dueDateEnd < now) return 'overdue';
    if (invoice.paidAmount > 0) return 'partial';
    return invoice.sentAt ? 'sent' : 'draft';
  }

  private buildTotals(items: InvoiceItemDto[]) {
    const subtotal = items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
    return {
      subtotal,
      total: subtotal,
      paidAmount: 0,
      balanceAmount: subtotal,
    };
  }

  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    let counter = await this.counterModel.findOne({ year }).exec();
    if (!counter) {
      const existingInvoices = await this.invoiceModel
        .find({ invoiceNumber: new RegExp(`^${prefix}`) })
        .select('invoiceNumber')
        .lean();
      const existingSequence = existingInvoices.reduce((highest, invoice) => {
        const match = invoice.invoiceNumber.match(/(\d+)$/);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      try {
        counter = await this.counterModel.create({ year, sequence: existingSequence });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) throw error;
        counter = await this.counterModel.findOne({ year }).exec();
      }
    }
    if (!counter) throw new ConflictException(`Invoice counter for ${year} could not be initialized`);

    counter = await this.counterModel.findOneAndUpdate(
      { year },
      { $inc: { sequence: 1 } },
      { new: true },
    ).exec();
    if (!counter) throw new ConflictException(`Invoice counter for ${year} could not be advanced`);
    return `${prefix}${String(counter.sequence).padStart(3, '0')}`;
  }

  async create(dto: CreateInvoiceDto) {
    const client = await this.clientModel.findById(dto.clientId).lean();
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const linkedOrderIds = dto.items.flatMap((item) => item.orderId ? [item.orderId] : []);
    const uniqueOrderIds = [...new Set(linkedOrderIds)];
    if (uniqueOrderIds.length !== linkedOrderIds.length) {
      throw new BadRequestException('An order can only appear once on an invoice.');
    }
    if (uniqueOrderIds.length > 0) {
      const clientOrders = await this.orderModel.collection.countDocuments({
        _id: { $in: uniqueOrderIds.map((id) => new Types.ObjectId(id)) },
        clientId: { $in: [client._id, client._id.toString()] },
      });
      if (clientOrders !== uniqueOrderIds.length) {
        throw new BadRequestException('Invoice orders must belong to the selected client.');
      }
      const existingInvoice = await this.invoiceModel.exists({
        'items.orderId': { $in: uniqueOrderIds.map((id) => new Types.ObjectId(id)) },
      });
      if (existingInvoice) {
        throw new ConflictException('An order can only be billed once. Record additional payments on its existing invoice.');
      }
    }

    const totals = this.buildTotals(dto.items);
    const invoiceNumber = await this.generateInvoiceNumber();

    const invoice = await this.invoiceModel.create({
      clientId: new Types.ObjectId(dto.clientId),
      invoiceNumber,
      invoiceDate: new Date(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      items: dto.items.map((item) => ({
        orderId: item.orderId ? new Types.ObjectId(item.orderId) : undefined,
        garmentType: item.garmentType.trim(),
        description: item.description?.trim(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      })),
      subtotal: totals.subtotal,
      total: totals.total,
      paidAmount: totals.paidAmount,
      balanceAmount: totals.balanceAmount,
      status: this.getStatus(totals),
      notes: dto.notes?.trim(),
    });

    return invoice.toObject();
  }

  async findAll(query: ListInvoicesQueryDto): Promise<{
    data: Array<Record<string, unknown>>;
    total: number;
    skip: number;
    limit: number;
    summary: { totalInvoices: number; dueAmount: number };
  }> {
    const skip = query.skip ?? 0;
    const limit = query.limit ?? 10;
    const [invoices, summaryRows] = await Promise.all([
      this.invoiceModel
        .find()
        .populate('clientId', 'name phone email address')
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.invoiceModel.aggregate([
        {
          $group: {
            _id: null,
            totalInvoices: { $sum: 1 },
            dueAmount: { $sum: '$balanceAmount' },
          },
        },
      ]),
    ]);
    return {
      data: invoices.map((invoice) => ({
        ...invoice,
        status: this.getStatus(invoice),
      })),
      total: summaryRows[0]?.totalInvoices ?? 0,
      skip,
      limit,
      summary: {
        totalInvoices: summaryRows[0]?.totalInvoices ?? 0,
        dueAmount: summaryRows[0]?.dueAmount ?? 0,
      },
    };
  }

  async findByClient(clientId: string): Promise<Array<Record<string, unknown>>> {
    const invoices = await this.invoiceModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .populate('clientId', 'name phone email address')
      .sort({ invoiceDate: -1, createdAt: -1 })
      .lean();
    return invoices.map((invoice): Record<string, unknown> => ({
      ...invoice,
      status: this.getStatus(invoice),
    }));
  }

  async findOne(id: string): Promise<Record<string, unknown>> {
    const invoice = await this.invoiceModel
      .findById(id)
      .populate('clientId', 'name phone email address')
      .lean();

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return { ...invoice, status: this.getStatus(invoice) };
  }

  async markSent(invoiceId: string) {
    const invoice = await this.invoiceModel.findById(invoiceId).exec();
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!invoice.sentAt) invoice.sentAt = new Date();
    invoice.status = this.getStatus(invoice);
    await invoice.save();
    return invoice.toObject();
  }

  async findPayments(invoiceId: string) {
    const invoice = await this.invoiceModel.findById(invoiceId).select('_id').lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.paymentModel.find({ invoiceId: invoice._id })
      .sort({ receivedAt: -1, _id: -1 })
      .lean();
  }

  async recordPayment(invoiceId: string, dto: RecordInvoicePaymentDto) {
    if (!Number.isInteger(dto.amount) || dto.amount < 1) {
      throw new BadRequestException('Payment amount must be a whole number greater than zero');
    }
    if (!Types.ObjectId.isValid(invoiceId)) {
      throw new BadRequestException('Invoice id is invalid');
    }

    const invoiceObjectId = new Types.ObjectId(invoiceId);
    const fingerprint = paymentFingerprint(dto);
    const session = await this.connection.startSession();
    let updatedInvoice: InvoiceDocument | undefined;
    try {
      await session.withTransaction(async () => {
        const invoice = await this.invoiceModel.findById(invoiceObjectId).session(session).exec();
        if (!invoice) throw new NotFoundException('Invoice not found');

        const duplicate = await this.paymentModel.findOne({
          clientId: invoice.clientId,
          idempotencyKey: dto.idempotencyKey,
        }).session(session).exec();
        if (duplicate) {
          this.assertSameInvoicePayment(duplicate, invoiceObjectId, fingerprint);
          updatedInvoice = invoice;
          return;
        }

        if (dto.amount > invoice.balanceAmount) {
          throw new BadRequestException('Payment cannot exceed the invoice balance due');
        }

        invoice.paidAmount += dto.amount;
        invoice.balanceAmount = Math.max(0, invoice.total - invoice.paidAmount);
        invoice.status = this.getStatus(invoice);
        await invoice.save({ session });

        const payment = new this.paymentModel({
          clientId: invoice.clientId,
          invoiceId: invoice._id,
          amount: dto.amount,
          method: dto.method ?? PaymentMethod.CASH,
          reference: dto.reference?.trim(),
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
          notes: dto.notes?.trim() || `Payment for invoice ${invoice.invoiceNumber}`,
          idempotencyKey: dto.idempotencyKey,
          requestFingerprint: fingerprint,
          allocations: [],
        });
        await payment.save({ session });
        updatedInvoice = invoice;
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const duplicate = await this.paymentModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        }).exec();
        if (duplicate) {
          this.assertSameInvoicePayment(duplicate, invoiceObjectId, fingerprint);
          const currentInvoice = await this.invoiceModel.findById(invoiceObjectId).exec();
          if (currentInvoice) return currentInvoice.toObject();
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (!updatedInvoice) throw new ConflictException('Invoice payment could not be saved');
    return updatedInvoice.toObject();
  }

  private assertSameInvoicePayment(
    payment: PaymentDocument,
    invoiceId: Types.ObjectId,
    fingerprint: string,
  ) {
    if (!payment.invoiceId?.equals(invoiceId) || payment.requestFingerprint !== fingerprint) {
      throw new ConflictException('This payment request key was already used for a different payment');
    }
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
