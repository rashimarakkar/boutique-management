import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Client } from '../clients/client.schema';
import { Order } from '../orders/order.schema';

export type PaymentDocument = HydratedDocument<CustomerPayment>;

export enum PaymentMethod {
  CASH = 'cash',
  UPI = 'upi',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
  OTHER = 'other',
}

export enum PaymentSource {
  MANUAL = 'manual',
  LEGACY_IMPORT = 'legacy_import',
}

@Schema({ _id: false })
export class AllocationReversal {
  @Prop({ required: true, min: 1 })
  amount!: number;

  @Prop({ required: true, default: Date.now })
  reversedAt!: Date;

  @Prop({ required: true, trim: true })
  reason!: string;

  @Prop({ trim: true })
  reversedBy?: string;
}
const AllocationReversalSchema = SchemaFactory.createForClass(AllocationReversal);

@Schema()
export class PaymentAllocation {
  @Prop({ type: Types.ObjectId, ref: Order.name, required: true })
  orderId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  amount!: number;

  @Prop({ required: true, default: Date.now })
  allocatedAt!: Date;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  allocatedBy?: string;

  @Prop({ type: [AllocationReversalSchema], default: [] })
  reversals!: AllocationReversal[];
}
const PaymentAllocationSchema = SchemaFactory.createForClass(PaymentAllocation);

@Schema({ _id: false })
export class AllocationRequest {
  @Prop({ required: true, trim: true })
  idempotencyKey!: string;

  @Prop({ required: true })
  requestFingerprint!: string;

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;
}
const AllocationRequestSchema = SchemaFactory.createForClass(AllocationRequest);

@Schema({ timestamps: true })
export class CustomerPayment {
  @Prop({ type: Types.ObjectId, ref: Client.name, required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Invoice', index: true })
  invoiceId?: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  amount!: number;

  @Prop({ enum: PaymentMethod, default: PaymentMethod.CASH, required: true })
  method!: PaymentMethod;

  @Prop({ trim: true })
  reference?: string;

  @Prop({ required: true, default: Date.now, index: true })
  receivedAt!: Date;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, trim: true })
  idempotencyKey!: string;

  @Prop({ required: true })
  requestFingerprint!: string;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop({ enum: PaymentSource, default: PaymentSource.MANUAL, required: true })
  source!: PaymentSource;

  @Prop({ type: [PaymentAllocationSchema], default: [] })
  allocations!: PaymentAllocation[];

  @Prop({ type: [AllocationRequestSchema], default: [] })
  allocationRequests!: AllocationRequest[];
}
export const CustomerPaymentSchema = SchemaFactory.createForClass(CustomerPayment);
CustomerPaymentSchema.index({ clientId: 1, idempotencyKey: 1 }, { unique: true });
CustomerPaymentSchema.index({ 'allocations.orderId': 1, receivedAt: -1 });
CustomerPaymentSchema.index({ invoiceId: 1, receivedAt: -1 });
