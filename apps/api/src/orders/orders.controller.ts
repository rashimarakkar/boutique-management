import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { CreateOrderDto, UpdateOrderDto } from './dto';
import { CreateGarmentTypeDto } from './garment-type.dto';
import { ListOrdersQueryDto } from './list-orders-query.dto';
import { OrdersService } from './orders.service';
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post() create(@Body() dto: CreateOrderDto) { return this.orders.create(dto); }
  @Get('garment-types') findGarmentTypes() { return this.orders.findGarmentTypes(); }
  @Post('garment-types') createGarmentType(@Body() dto: CreateGarmentTypeDto) { return this.orders.createGarmentType(dto.name); }
  @Get(':id/media/:filename')
  async getMedia(@Param('id') id: string, @Param('filename') filename: string) {
    const media = await this.orders.getMedia(id, filename);
    if (!media) throw new NotFoundException('Media not found');
    return new StreamableFile(media.data, {
      type: media.contentType,
      disposition: 'inline',
    });
  }
  @Get() findAll(@Query() query: ListOrdersQueryDto) { return this.orders.findAll(query); }
  @Get(':id') findOne(@Param('id') id: string) { return this.orders.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateOrderDto) { return this.orders.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.orders.remove(id); }
}
