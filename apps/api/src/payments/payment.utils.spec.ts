import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PaymentAllocationDto } from './dto';
import {
  allocationFingerprint,
  assertAllocationAllowed,
  assertAllocationWithinAvailable,
  getOrderBalance,
  getUnallocatedAmount,
  paymentFingerprint,
  validateAllocations,
} from './payment.utils';

test('payment balances report partial and fully unallocated amounts', () => {
  assert.equal(getUnallocatedAmount(1000, [{ amount: 250 }, { amount: 300 }]), 450);
  assert.equal(
    getUnallocatedAmount(1000, [{ amount: 500, reversals: [{ amount: 200 }] }]),
    700,
  );
  assert.equal(getOrderBalance(1200, 500), 700);
  assert.equal(getOrderBalance(1200, 1300), 0);
});

test('payment allocations cannot exceed the available receipt amount', () => {
  assert.doesNotThrow(() => assertAllocationWithinAvailable(1000, [{ amount: 400 }]));
  assert.throws(
    () => assertAllocationWithinAvailable(1000, [{ amount: 600 }, { amount: 401 }]),
    BadRequestException,
  );
});

test('order allocations require the same customer and available order balance', () => {
  const valid = {
    amount: 300,
    totalAmount: 1000,
    paidAmount: 600,
    sameCustomer: true,
    cancelled: false,
    orderLabel: 'Dress',
  };
  assert.doesNotThrow(() => assertAllocationAllowed(valid));
  assert.throws(
    () => assertAllocationAllowed({ ...valid, sameCustomer: false }),
    BadRequestException,
  );
  assert.throws(
    () => assertAllocationAllowed({ ...valid, cancelled: true }),
    BadRequestException,
  );
  assert.throws(
    () => assertAllocationAllowed({ ...valid, amount: 401 }),
    BadRequestException,
  );
});

test('allocation requests reject the same order more than once', () => {
  const allocations = [
    { orderId: '0123456789abcdef01234567', amount: 100 },
    { orderId: '0123456789abcdef01234567', amount: 200 },
  ] satisfies PaymentAllocationDto[];
  assert.throws(() => validateAllocations(allocations), BadRequestException);
});

test('payment idempotency fingerprints are independent of allocation ordering', () => {
  const first = [
    { orderId: '0123456789abcdef01234567', amount: 100 },
    { orderId: 'fedcba9876543210fedcba98', amount: 200 },
  ];
  const second = [...first].reverse();
  assert.equal(allocationFingerprint(first), allocationFingerprint(second));
  assert.equal(
    paymentFingerprint({ amount: 500, allocations: first }),
    paymentFingerprint({ amount: 500, allocations: second }),
  );
});
