import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto';
import { ListClientsQueryDto } from './list-clients-query.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}
  @Post() create(@Body() dto: CreateClientDto) { return this.clients.create(dto); }
  @Get('paged') findAllPaged(@Query() query: ListClientsQueryDto) { return this.clients.findAllPaged(query); }
  @Get() findAll(@Query('q') q?: string) { return this.clients.findAll(q); }
  @Get(':id/summary') getSummary(@Param('id') id: string) { return this.clients.getSummary(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateClientDto) { return this.clients.update(id, dto); }
  @Get(':id') findOne(@Param('id') id: string) { return this.clients.findOne(id); }
  @Delete(':id') remove(@Param('id') id: string) { return this.clients.remove(id); }
}
