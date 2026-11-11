import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Client } from '../clients/client.schema';

export type InvoiceDocument = HydratedDocument<Invoice>;

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue';

@Schema({ _id: false })
export class InvoiceItem {
  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  orderId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  garmentType!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, min: 1, default: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  @Prop({ required: true, min: 0 })
  total!: number;
}
export const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);

@Schema({ timestamps: true })
export class Invoice {
  @Prop({ type: Types.ObjectId, ref: Client.name, required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true, index: true })
  invoiceNumber!: string;

  @Prop({ required: true, default: Date.now, index: true })
  invoiceDate!: Date;

  @Prop({ type: Date })
  sentAt?: Date;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: [InvoiceItemSchema], default: [] })
  items!: InvoiceItem[];

  @Prop({ required: true, min: 0, default: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0, default: 0 })
  total!: number;

  @Prop({ required: true, min: 0, default: 0 })
  paidAmount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  balanceAmount!: number;

  @Prop({ enum: ['draft', 'sent', 'partial', 'paid', 'overdue'], default: 'draft', index: true })
  status!: InvoiceStatus;

  @Prop({ trim: true })
  notes?: string;
}
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
