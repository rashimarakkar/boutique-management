import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GarmentTypeDocument = HydratedDocument<GarmentType>;

@Schema({ timestamps: true })
export class GarmentType {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  normalizedName!: string;
}

export const GarmentTypeSchema = SchemaFactory.createForClass(GarmentType);
