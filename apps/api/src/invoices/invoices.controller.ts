import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateInvoiceDto, ListInvoicesQueryDto, RecordInvoicePaymentDto } from './dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListInvoicesQueryDto): ReturnType<InvoicesService['findAll']> {
    return this.invoicesService.findAll(query);
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string): ReturnType<InvoicesService['findByClient']> {
    return this.invoicesService.findByClient(clientId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): ReturnType<InvoicesService['findOne']> {
    return this.invoicesService.findOne(id);
  }

  @Patch(':id/send')
  markSent(@Param('id') id: string) {
    return this.invoicesService.markSent(id);
  }

  @Post(':id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: RecordInvoicePaymentDto) {
    return this.invoicesService.recordPayment(id, dto);
  }

  @Get(':id/payments')
  findPayments(@Param('id') id: string) {
    return this.invoicesService.findPayments(id);
  }
}
