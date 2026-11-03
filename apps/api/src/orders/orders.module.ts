import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './order.schema';
import { Client, ClientSchema } from '../clients/client.schema';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
@Module({ imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }, { name: Client.name, schema: ClientSchema }])], controllers: [OrdersController], providers: [OrdersService], exports: [MongooseModule] })
export class OrdersModule {}
