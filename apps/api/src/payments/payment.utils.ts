import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PaymentAllocationDto } from './dto';

export function getUnallocatedAmount(
  amount: number,
  allocations: readonly {
    amount: number;
    reversals?: readonly { amount: number }[];
  }[],
) {
  const netAllocated = allocations.reduce(
    (sum, allocation) =>
      sum + allocation.amount -
      (allocation.reversals ?? []).reduce((reversed, item) => reversed + item.amount, 0),
    0,
  );
  return amount - netAllocated;
}

export function getOrderBalance(totalAmount: number | undefined, paidAmount: number) {
  return Math.max(0, (totalAmount ?? 0) - paidAmount);
}

export function assertAllocationAllowed(input: {
  amount: number;
  totalAmount?: number;
  paidAmount: number;
  sameCustomer: boolean;
  cancelled: boolean;
  orderLabel: string;
}) {
  if (!input.sameCustomer) {
    throw new BadRequestException('Payments can only be allocated to the same customer’s orders');
  }
  if (input.cancelled) {
    throw new BadRequestException('Payments cannot be allocated to a cancelled order');
  }
  if (input.amount > getOrderBalance(input.totalAmount, input.paidAmount)) {
    throw new BadRequestException(
      `Allocation exceeds the outstanding balance for ${input.orderLabel}`,
    );
  }
}

export function assertAllocationWithinAvailable(
  amount: number,
  allocations: readonly { amount: number }[],
) {
  if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) > amount) {
    throw new BadRequestException('Allocations exceed the payment amount');
  }
}

export function validateAllocations(allocations: readonly PaymentAllocationDto[]) {
  const seen = new Set<string>();
  for (const allocation of allocations) {
    if (seen.has(allocation.orderId)) {
      throw new BadRequestException('Each order can appear only once per allocation request');
    }
    seen.add(allocation.orderId);
  }
}

export function paymentFingerprint(dto: {
  amount: number;
  method?: string;
  reference?: string;
  receivedAt?: string;
  notes?: string;
  allocations?: PaymentAllocationDto[];
}) {
  const canonical = {
    amount: dto.amount,
    method: dto.method ?? 'cash',
    reference: dto.reference?.trim() ?? '',
    receivedAt: dto.receivedAt ? new Date(dto.receivedAt).toISOString() : null,
    notes: dto.notes?.trim() ?? '',
    allocations: [...(dto.allocations ?? [])]
      .map(({ orderId, amount, notes }) => ({ orderId, amount, notes: notes?.trim() ?? '' }))
      .sort((left, right) => left.orderId.localeCompare(right.orderId)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function allocationFingerprint(allocations: readonly PaymentAllocationDto[]) {
  const canonical = [...allocations]
    .map(({ orderId, amount, notes }) => ({ orderId, amount, notes: notes?.trim() ?? '' }))
    .sort((left, right) => left.orderId.localeCompare(right.orderId));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
