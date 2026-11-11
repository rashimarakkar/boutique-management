import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './client.schema';
import { Order, OrderSchema } from '../orders/order.schema';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { CustomerPayment, CustomerPaymentSchema } from '../payments/payment.schema';
import { Invoice, InvoiceSchema } from '../invoices/invoice.schema';
@Module({ imports: [MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }, { name: Order.name, schema: OrderSchema }, { name: CustomerPayment.name, schema: CustomerPaymentSchema }, { name: Invoice.name, schema: InvoiceSchema }])], controllers: [ClientsController], providers: [ClientsService], exports: [MongooseModule] })
export class ClientsModule {}
