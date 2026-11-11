import { Controller, Get, Param } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('clients')
export class ClientPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':clientId/payments')
  findByClient(@Param('clientId') clientId: string) {
    return this.payments.findByClient(clientId);
  }
}

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('orders/:orderId/payments')
  findByOrder(@Param('orderId') orderId: string): ReturnType<PaymentsService['findByOrder']> {
    return this.payments.findByOrder(orderId);
  }
}
