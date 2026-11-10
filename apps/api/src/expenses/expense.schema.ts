import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExpenseDocument = HydratedDocument<Expense>;

@Schema({ timestamps: true })
export class Expense {
  @Prop({ required: true, trim: true, maxlength: 80, index: true })
  category!: string;

  @Prop({ trim: true, maxlength: 300 })
  description?: string;

  @Prop({ required: true, min: 1 })
  amount!: number;

  @Prop({ required: true, type: Date, index: true })
  expenseDate!: Date;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ expenseDate: -1, _id: -1 });
