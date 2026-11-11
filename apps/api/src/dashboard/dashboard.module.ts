import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/order.schema';
import { CustomerPayment, CustomerPaymentSchema } from '../payments/payment.schema';
import { Expense, ExpenseSchema } from '../expenses/expense.schema';
import { Invoice, InvoiceSchema } from '../invoices/invoice.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
@Module({
  imports: [MongooseModule.forFeature([
    { name: Order.name, schema: OrderSchema },
    { name: CustomerPayment.name, schema: CustomerPaymentSchema },
    { name: Expense.name, schema: ExpenseSchema },
    { name: Invoice.name, schema: InvoiceSchema },
  ])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
