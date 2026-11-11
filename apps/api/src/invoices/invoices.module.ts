import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/client.schema';
import { CustomerPayment, CustomerPaymentSchema } from '../payments/payment.schema';
import { Order, OrderSchema } from '../orders/order.schema';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { InvoiceCounter, InvoiceCounterSchema } from './invoice-counter.schema';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: Client.name, schema: ClientSchema },
      { name: CustomerPayment.name, schema: CustomerPaymentSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [MongooseModule],
})
export class InvoicesModule {}
