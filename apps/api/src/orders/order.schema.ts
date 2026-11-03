import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Client } from '../clients/client.schema';

export type OrderDocument = HydratedDocument<Order>;
export enum OrderStatus { NEW = 'new', MEASUREMENTS_PENDING = 'measurements_pending', DESIGNING = 'designing', STITCHING = 'stitching', READY = 'ready', DELIVERED = 'delivered', CANCELLED = 'cancelled' }

@Schema({ _id: false })
export class Measurement {
  @Prop({ required: true, trim: true }) label!: string;
  @Prop({ required: true, trim: true }) value!: string;
  @Prop({ default: 'inches', trim: true }) unit!: string;
}
const MeasurementSchema = SchemaFactory.createForClass(Measurement);

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: Client.name, required: true, index: true }) clientId!: Types.ObjectId;
  @Prop({ required: true, trim: true }) garmentType!: string;
  @Prop({ trim: true }) description?: string;
  @Prop({ enum: OrderStatus, default: OrderStatus.NEW, index: true }) status!: OrderStatus;
  @Prop({ type: Date }) givenDate?: Date;
  @Prop({ type: Date, required: true, index: true }) deliveryDate!: Date;
  @Prop({ type: [MeasurementSchema], default: [] }) measurements!: Measurement[];
  @Prop({ type: [String], default: [] }) referenceLinks!: string[];
  @Prop({ type: [String], default: [] }) imageUrls!: string[];
  @Prop() sketchUrl?: string;
  @Prop({ min: 0 }) totalAmount?: number;
  @Prop({ min: 0, default: 0 }) advancePaid!: number;
  @Prop({ trim: true }) notes?: string;
}
export const OrderSchema = SchemaFactory.createForClass(Order);
