import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Expense, ExpenseSchema } from './expense.schema';
import { ExpenseCategory, ExpenseCategorySchema } from './expense-category.schema';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Expense.name, schema: ExpenseSchema },
    { name: ExpenseCategory.name, schema: ExpenseCategorySchema },
  ])],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
