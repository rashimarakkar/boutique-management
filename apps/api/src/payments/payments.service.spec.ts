import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ClientDocument } from '../clients/client.schema';
import { OrderDocument, OrderStatus } from '../orders/order.schema';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { CustomerPayment, PaymentDocument } from './payment.schema';
import { PaymentsService } from './payments.service';

class FakeQuery<T> {
  constructor(private readonly resolve: () => T | Promise<T>) {}
  session(_session: ClientSession) { return this; }
  select(_fields: string) { return this; }
  sort(_sort: Record<string, number>) { return this; }
  lean() { return this; }
  exec() { return Promise.resolve(this.resolve()); }
}

class FakeOrder {
  static saveCount = 0;
  static failOnSaveNumber = 0;
  readonly _id: Types.ObjectId;
  clientId: Types.ObjectId;
  totalAmount: number;
  advancePaid = 0;
  paidAmount = 0;
  legacyPaidAmount = 0;
  status = OrderStatus.NEW;
  garmentType: string;

  constructor(clientId: Types.ObjectId, totalAmount: number, garmentType: string) {
    this._id = new Types.ObjectId();
    this.clientId = clientId;
    this.totalAmount = totalAmount;
    this.garmentType = garmentType;
  }
  markModified(_field: string) {}
  async save(_options?: { session: ClientSession }) {
    FakeOrder.saveCount += 1;
    if (FakeOrder.saveCount === FakeOrder.failOnSaveNumber) {
      throw new Error('Simulated order write failure');
    }
    return this;
  }
}

type FakeAllocation = { orderId: Types.ObjectId; amount: number };
class FakePayment {
  static records: FakePayment[] = [];
  readonly _id = new Types.ObjectId();
  clientId!: Types.ObjectId;
  amount!: number;
  idempotencyKey!: string;
  requestFingerprint!: string;
  allocations: FakeAllocation[] = [];
  allocationRequests: Array<{ idempotencyKey: string; requestFingerprint: string }> = [];
  [key: string]: unknown;

  constructor(data: Record<string, unknown>) {
    Object.assign(this, data);
    this.allocations = (data.allocations as FakeAllocation[] | undefined) ?? [];
    this.allocationRequests =
      (data.allocationRequests as typeof this.allocationRequests | undefined) ?? [];
  }

  async save(_options?: { session: ClientSession }) {
    const index = FakePayment.records.findIndex((item) => item._id.equals(this._id));
    if (index < 0) FakePayment.records.push(this);
    else FakePayment.records[index] = this;
    return this;
  }

  toObject() {
    return {
      ...this,
      allocations: this.allocations.map((item) => ({ ...item })),
      allocationRequests: this.allocationRequests.map((item) => ({ ...item })),
    };
  }

  static findOne(filter: Record<string, unknown>) {
    return new FakeQuery(() => FakePayment.records.find((payment) =>
      (!filter._id || payment._id.equals(filter._id as Types.ObjectId)) &&
      (!filter.clientId || payment.clientId.equals(filter.clientId as Types.ObjectId)) &&
      (!filter.idempotencyKey || payment.idempotencyKey === filter.idempotencyKey),
    ) ?? null);
  }

  static findById(id: Types.ObjectId) {
    return new FakeQuery(() => FakePayment.records.find((payment) => payment._id.equals(id)) ?? null);
  }

  static exists(filter: Record<string, unknown>) {
    return {
      then: (resolve: (value: boolean) => unknown) =>
        Promise.resolve(FakePayment.records.some((payment) =>
          payment.allocations.some((allocation) =>
            allocation.orderId.equals(filter['allocations.orderId'] as Types.ObjectId),
          ),
        )).then(resolve),
    };
  }
}

class FakeOrders {
  static records: FakeOrder[] = [];
  static find(filter: { _id: { $in: Types.ObjectId[] } }) {
    return new FakeQuery(() =>
      FakeOrders.records.filter((order) =>
        filter._id.$in.some((id) => id.equals(order._id)),
      ),
    );
  }
  static findById(id: Types.ObjectId) {
    return new FakeQuery(() => FakeOrders.records.find((order) => order._id.equals(id)) ?? null);
  }
  static exists(filter: { _id: Types.ObjectId }) {
    return {
      then: (resolve: (value: boolean) => unknown) =>
        Promise.resolve(FakeOrders.records.some((order) => order._id.equals(filter._id))).then(resolve),
    };
  }
}

function serviceFor(clientIds: Types.ObjectId[]) {
  FakePayment.records = [];
  const session = {
    withTransaction: async (operation: () => Promise<void>) => {
      const ordersBefore = FakeOrders.records.map((order) => ({
        order,
        advancePaid: order.advancePaid,
        paidAmount: order.paidAmount,
        legacyPaidAmount: order.legacyPaidAmount,
      }));
      const paymentsBefore = [...FakePayment.records];
      try {
        await operation();
      } catch (error) {
        for (const snapshot of ordersBefore) {
          snapshot.order.advancePaid = snapshot.advancePaid;
          snapshot.order.paidAmount = snapshot.paidAmount;
          snapshot.order.legacyPaidAmount = snapshot.legacyPaidAmount;
        }
        FakePayment.records = paymentsBefore;
        throw error;
      }
    },
    endSession: async () => undefined,
  };
  FakeOrder.saveCount = 0;
  FakeOrder.failOnSaveNumber = 0;
  const connection = { startSession: async () => session };
  const clients = {
    exists: (filter: { _id: Types.ObjectId }) => ({
      session: async () => clientIds.some((id) => id.equals(filter._id)),
    }),
  };
  return new PaymentsService(
    connection as unknown as Connection,
    FakePayment as unknown as Model<PaymentDocument>,
    clients as unknown as Model<ClientDocument>,
    FakeOrders as unknown as Model<OrderDocument>,
  );
}

test('payment workflow allocates across orders and retries without double allocation', async () => {
  const clientId = new Types.ObjectId();
  const firstOrder = new FakeOrder(clientId, 1000, 'Dress');
  const secondOrder = new FakeOrder(clientId, 700, 'Blouse');
  FakeOrders.records = [firstOrder, secondOrder];
  const service = serviceFor([clientId]);

  const payment = await service.create(clientId.toString(), {
    amount: 1500,
    idempotencyKey: 'receipt-key-0001',
    allocations: [{ orderId: firstOrder._id.toString(), amount: 400 }],
  });
  assert.equal(payment.unallocatedAmount, 1100);
  assert.equal(firstOrder.paidAmount, 400);

  const request = {
    idempotencyKey: 'allocation-key-0001',
    allocations: [{ orderId: secondOrder._id.toString(), amount: 600 }],
  };
  const allocation = await service.addAllocations(
    String(payment._id),
    request,
  );
  const retry = await service.addAllocations(String(payment._id), request);

  assert.equal(allocation.unallocatedAmount, 500);
  assert.equal(retry.unallocatedAmount, 500);
  assert.equal(firstOrder.paidAmount, 400);
  assert.equal(secondOrder.paidAmount, 600);
  assert.equal(FakePayment.records.length, 1);
});

test('payment workflow rejects another customer’s order and excess allocations', async () => {
  const clientId = new Types.ObjectId();
  const otherClientId = new Types.ObjectId();
  const otherOrder = new FakeOrder(otherClientId, 1000, 'Skirt');
  FakeOrders.records = [otherOrder];
  const service = serviceFor([clientId, otherClientId]);

  await assert.rejects(
    () => service.create(clientId.toString(), {
      amount: 1000,
      idempotencyKey: 'receipt-key-0002',
      allocations: [{ orderId: otherOrder._id.toString(), amount: 100 }],
    }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.create(clientId.toString(), {
      amount: 100,
      idempotencyKey: 'receipt-key-0003',
      allocations: [{ orderId: otherOrder._id.toString(), amount: 101 }],
    }),
    BadRequestException,
  );
  assert.equal(FakePayment.records.length, 0);
});

test('one order advance and combined payments keep each order balance in sync', async () => {
  const clientId = new Types.ObjectId();
  const singleOrder = new FakeOrder(clientId, 1000, 'Dress');
  const orders = [
    new FakeOrder(clientId, 1000, 'Blouse'),
    new FakeOrder(clientId, 500, 'Skirt'),
    new FakeOrder(clientId, 800, 'Jacket'),
  ];
  FakeOrders.records = [singleOrder, ...orders];
  const service = serviceFor([clientId]);

  const singleAdvance = await service.create(clientId.toString(), {
    amount: 250,
    idempotencyKey: 'single-order-advance',
    allocations: [{ orderId: singleOrder._id.toString(), amount: 250 }],
  });
  assert.equal(singleOrder.paidAmount, 250);
  assert.equal(singleOrder.totalAmount - singleOrder.paidAmount, 750);
  assert.equal(singleAdvance.unallocatedAmount, 0);

  const combined = await service.create(clientId.toString(), {
    amount: 1000,
    idempotencyKey: 'three-order-advance',
    receivedAt: '2026-11-02T12:00:00.000Z',
    allocations: [
      { orderId: orders[0]._id.toString(), amount: 300 },
      { orderId: orders[1]._id.toString(), amount: 200 },
      { orderId: orders[2]._id.toString(), amount: 150 },
    ],
  });
  assert.equal(combined.unallocatedAmount, 350);
  assert.deepEqual(orders.map((order) => order.paidAmount), [300, 200, 150]);

  await service.create(clientId.toString(), {
    amount: 800,
    idempotencyKey: 'later-payment',
    receivedAt: '2026-11-08T12:00:00.000Z',
    allocations: [
      { orderId: orders[0]._id.toString(), amount: 700 },
      { orderId: orders[1]._id.toString(), amount: 100 },
    ],
  });
  assert.deepEqual(orders.map((order) => order.paidAmount), [1000, 300, 150]);
  assert.deepEqual(orders.map((order) => order.totalAmount - order.paidAmount), [0, 200, 650]);
  assert.equal(FakePayment.records.length, 3);
  assert.equal(FakePayment.records[1].receivedAt instanceof Date, true);
});

test('unallocated advances can be assigned later and cannot be over-allocated', async () => {
  const clientId = new Types.ObjectId();
  const order = new FakeOrder(clientId, 600, 'Dress');
  FakeOrders.records = [order];
  const service = serviceFor([clientId]);

  const receipt = await service.create(clientId.toString(), {
    amount: 500,
    idempotencyKey: 'unallocated-receipt',
  });
  assert.equal(receipt.unallocatedAmount, 500);
  assert.equal(order.paidAmount, 0);

  const request = {
    idempotencyKey: 'allocate-existing-advance',
    allocations: [{ orderId: order._id.toString(), amount: 300 }],
  };
  const allocated = await service.addAllocations(String(receipt._id), request);
  assert.equal(allocated.unallocatedAmount, 200);
  assert.equal(order.paidAmount, 300);
  await assert.rejects(
    () => service.addAllocations(String(receipt._id), {
      idempotencyKey: 'exceed-available-advance',
      allocations: [{ orderId: order._id.toString(), amount: 201 }],
    }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.create(clientId.toString(), {
      amount: 301,
      idempotencyKey: 'exceed-order-balance',
      allocations: [{ orderId: order._id.toString(), amount: 301 }],
    }),
    BadRequestException,
  );
  assert.equal(order.paidAmount, 300);
  assert.equal(FakePayment.records.length, 1);
});

test('a failed allocation write rolls back all order and payment changes', async () => {
  const clientId = new Types.ObjectId();
  const firstOrder = new FakeOrder(clientId, 1000, 'Dress');
  const secondOrder = new FakeOrder(clientId, 1000, 'Blouse');
  FakeOrders.records = [firstOrder, secondOrder];
  const service = serviceFor([clientId]);
  FakeOrder.failOnSaveNumber = 2;

  await assert.rejects(
    () => service.create(clientId.toString(), {
      amount: 600,
      idempotencyKey: 'transaction-rollback',
      allocations: [
        { orderId: firstOrder._id.toString(), amount: 300 },
        { orderId: secondOrder._id.toString(), amount: 300 },
      ],
    }),
    /Simulated order write failure/,
  );

  assert.equal(firstOrder.paidAmount, 0);
  assert.equal(secondOrder.paidAmount, 0);
  assert.equal(FakePayment.records.length, 0);
});

test('legacy order balances are imported before adding new allocations', async () => {
  const clientId = new Types.ObjectId();
  const order = new FakeOrder(clientId, 1000, 'Vintage order');
  order.advancePaid = 200;
  order.paidAmount = 200;
  delete (order as Partial<FakeOrder>).legacyPaidAmount;
  FakeOrders.records = [order];
  const service = serviceFor([clientId]);

  await service.create(clientId.toString(), {
    amount: 100,
    idempotencyKey: 'post-migration-payment',
    allocations: [{ orderId: order._id.toString(), amount: 100 }],
  });

  assert.equal(order.paidAmount, 300);
  assert.equal(order.legacyPaidAmount, 0);
  assert.equal(FakePayment.records.length, 2);
  assert.equal(FakePayment.records[0].amount, 200);
  assert.equal(FakePayment.records[1].amount, 100);
});
