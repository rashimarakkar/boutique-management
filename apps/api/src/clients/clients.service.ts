import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './client.schema';
import { CreateClientDto } from './dto';

@Injectable()
export class ClientsService {
  constructor(@InjectModel(Client.name) private readonly model: Model<ClientDocument>) {}
  create(dto: CreateClientDto) { return this.model.create(dto); }
  findAll(query = '') {
    const filter = query ? { $or: [{ name: new RegExp(query, 'i') }, { phone: new RegExp(query, 'i') }] } : {};
    return this.model.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  }
  async findOne(id: string) {
    const client = await this.model.findById(id).lean();
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }
}
