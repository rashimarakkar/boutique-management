import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExpenseCategoryDocument = HydratedDocument<ExpenseCategory>;

@Schema({ timestamps: true })
export class ExpenseCategory {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  normalizedName!: string;
}

export const ExpenseCategorySchema = SchemaFactory.createForClass(ExpenseCategory);
ExpenseCategorySchema.index({ normalizedName: 1 }, { unique: true });
