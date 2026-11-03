import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClientDocument = HydratedDocument<Client>;

@Schema({ timestamps: true })
export class Client {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, trim: true, index: true }) phone!: string;
  @Prop({ trim: true, lowercase: true }) email?: string;
  @Prop({ trim: true }) address?: string;
  @Prop({ trim: true }) notes?: string;
}
export const ClientSchema = SchemaFactory.createForClass(Client);
