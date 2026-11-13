import { vi } from 'vitest';
import {
  cancelStaffOrder,
  fetchStaffOrders,
  retryStaffRefund,
  updateStaffOrderStatus,
} from '../../../frontend/src/lib/staff-api';
import { getStaffOrderActions } from '../../../frontend/src/lib/staff-order-status';

vi.mock('../../../frontend/src/config/api', () => ({ API_URL: 'http://staff-api.test' }));

describe('Team staff frontend API integration', () => {
  const fetchMock = vi.fn();
  const order = (orderCode: string) => ({
    orderCode, status: 'PENDING', totalAmount: 57000,
    createdAt: '2026-11-13T00:00:00.000Z',
    customer: { email: 'customer@example.invalid', phone: '0900000000' },
    cancellationReason: null, refundStatus: 'NONE', refundAmount: 0, refunds: [],
    items: [{ productName: 'Test soda', size: 'M', quantity: 1, toppings: [] }],
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: () => 'staff-token' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads every page and adapts backend fields to the team cards', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ page: 1, pageSize: 1, total: 2, orders: [order('ORD-1')] }))
      .mockResolvedValueOnce(Response.json({ page: 2, pageSize: 1, total: 2, orders: [order('ORD-2')] }));
    const result = await fetchStaffOrders();
    expect(result.orders.map(({ orderCode }) => orderCode)).toEqual(['ORD-1', 'ORD-2']);
    expect(result.orders[0]).toMatchObject({ total: 57000, items: [{ name: 'Test soda' }] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://staff-api.test/staff/orders?page=1', 'http://staff-api.test/staff/orders?page=2',
    ]);
  });

  it('keeps the backend refund outcome and retry permission', async () => {
    const refund = {
      id: 'refund-1', status: 'NEEDS_REVIEW', method: 'SEPAY_V2', amount: 57000,
      lastError: 'network_or_timeout', attempts: 8,
      nextAttemptAt: '2026-11-13T00:00:00.000Z', completedAt: null, canRetry: true,
    };
    fetchMock.mockResolvedValueOnce(Response.json({ page: 1, pageSize: 20, total: 1, orders: [{
      ...order('ORD-1'), status: 'CANCELLED', cancellationReason: 'Customer request',
      refundStatus: 'NEEDS_REVIEW', refundAmount: 57000, refunds: [refund],
    }] }));
    const result = await fetchStaffOrders();
    expect(result.orders[0]).toMatchObject({ status: 'CANCELLED', refundStatus: 'NEEDS_REVIEW', refundAmount: 57000, refunds: [refund] });
  });

  it('rejects invalid totals rather than displaying incorrect prices', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ page: 1, pageSize: 20, total: 1, orders: [{ ...order('ORD-1'), totalAmount: '57000' }] }));
    await expect(fetchStaffOrders()).rejects.toMatchObject({ kind: 'contract' });
  });

  it('does not return a partial list if a later page fails', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ page: 1, pageSize: 1, total: 2, orders: [order('ORD-1')] }))
      .mockResolvedValueOnce(Response.json({ message: 'Unavailable' }, { status: 500 }));
    await expect(fetchStaffOrders()).rejects.toMatchObject({ status: 500 });
  });

  it('cancels through POST with the required trimmed reason', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ orderCode: 'ORD/1', status: 'CANCELLED' }));
    await expect(cancelStaffOrder('ORD/1', '  Customer request  ')).resolves.toEqual({ orderCode: 'ORD/1', status: 'CANCELLED' });
    expect(fetchMock).toHaveBeenCalledWith('http://staff-api.test/staff/orders/ORD%2F1/cancel', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ reason: 'Customer request' }),
      headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }),
    }));
  });

  it('does not send a cancellation without a reason', async () => {
    await expect(cancelStaffOrder('ORD-1', '   ')).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains PATCH for preparation and delivery', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ orderCode: 'ORD-1', status: 'PREPARING' }));
    await updateStaffOrderStatus('ORD-1', { status: 'PREPARING' });
    expect(fetchMock).toHaveBeenCalledWith('http://staff-api.test/staff/orders/ORD-1/status', expect.objectContaining({ method: 'PATCH', body: '{"status":"PREPARING"}' }));
  });

  it('requeues the existing refund without marking it completed', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ refundId: 'refund-1', status: 'PENDING' }));
    await expect(retryStaffRefund('ORD-1', 'refund-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('http://staff-api.test/staff/orders/ORD-1/refunds/refund-1/retry', expect.objectContaining({ method: 'POST' }));
  });

  it('requires login before sending staff requests', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    await expect(fetchStaffOrders()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows cancellation only before preparation', () => {
    for (const status of ['PENDING', 'PAYMENT_FAILED', 'PAID'] as const) {
      expect(getStaffOrderActions(status).some(({ status }) => status === 'CANCELLED')).toBe(true);
    }
    for (const status of ['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'] as const) {
      expect(getStaffOrderActions(status).some(({ status }) => status === 'CANCELLED')).toBe(false);
    }
  });
});
