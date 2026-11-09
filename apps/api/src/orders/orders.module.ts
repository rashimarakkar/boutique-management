import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './order.schema';
import { GarmentType, GarmentTypeSchema } from './garment-type.schema';
import { OrderMediaStorage } from './order-media.storage';
import { Client, ClientSchema } from '../clients/client.schema';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsModule } from '../payments/payments.module';
@Module({ imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }, { name: Client.name, schema: ClientSchema }, { name: GarmentType.name, schema: GarmentTypeSchema }]), PaymentsModule], controllers: [OrdersController], providers: [OrdersService, OrderMediaStorage], exports: [MongooseModule] })
export class OrdersModule {}
