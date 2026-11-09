import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/client.schema';
import { Order, OrderSchema } from '../orders/order.schema';
import { ClientPaymentsController, PaymentsController } from './payments.controller';
import { CustomerPayment, CustomerPaymentSchema } from './payment.schema';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerPayment.name, schema: CustomerPaymentSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [ClientPaymentsController, PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
