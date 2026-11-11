import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InvoiceCounterDocument = HydratedDocument<InvoiceCounter>;

@Schema()
export class InvoiceCounter {
  @Prop({ required: true, unique: true })
  year!: number;

  @Prop({ required: true, min: 0, default: 0 })
  sequence!: number;
}

export const InvoiceCounterSchema = SchemaFactory.createForClass(InvoiceCounter);
