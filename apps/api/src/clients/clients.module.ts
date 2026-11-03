import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './client.schema';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
@Module({ imports: [MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }])], controllers: [ClientsController], providers: [ClientsService], exports: [MongooseModule] })
export class ClientsModule {}
