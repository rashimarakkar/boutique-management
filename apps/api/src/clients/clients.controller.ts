import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}
  @Post() create(@Body() dto: CreateClientDto) { return this.clients.create(dto); }
  @Get() findAll(@Query('q') q?: string) { return this.clients.findAll(q); }
  @Get(':id') findOne(@Param('id') id: string) { return this.clients.findOne(id); }
}
