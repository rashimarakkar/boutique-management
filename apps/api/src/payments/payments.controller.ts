import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { AuthUser } from '../auth/auth.service';
import { AddPaymentAllocationsDto, CreatePaymentDto } from './dto';
import { PaymentsService } from './payments.service';

type AuthenticatedRequest = { user?: AuthUser };

@Controller('clients')
export class ClientPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':clientId/payments')
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreatePaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payments.create(clientId, dto, request.user?.sub);
  }

  @Get(':clientId/payments')
  findByClient(@Param('clientId') clientId: string) {
    return this.payments.findByClient(clientId);
  }
}

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments/:paymentId/allocations')
  allocate(
    @Param('paymentId') paymentId: string,
    @Body() dto: AddPaymentAllocationsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.payments.addAllocations(paymentId, dto, request.user?.sub);
  }

  @Get('orders/:orderId/payments')
  findByOrder(@Param('orderId') orderId: string): ReturnType<PaymentsService['findByOrder']> {
    return this.payments.findByOrder(orderId);
  }
}
