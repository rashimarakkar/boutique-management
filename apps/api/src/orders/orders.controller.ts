import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateOrderDto, UpdateOrderDto } from './dto';
import { OrdersService } from './orders.service';
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post() create(@Body() dto: CreateOrderDto) { return this.orders.create(dto); }
  @Get() findAll(@Query('status') status?: string, @Query('view') view?: string, @Query('q') q?: string) { return this.orders.findAll(status, view, q); }
  @Get(':id') findOne(@Param('id') id: string) { return this.orders.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateOrderDto) { return this.orders.update(id, dto); }
}
