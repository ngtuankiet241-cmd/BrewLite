import { refundMessage } from './refunds';

export type PaymentResult = {
  status: 'loading' | 'success' | 'pending' | 'failed' | 'error' | 'cancelled';
  message: string;
  refundPending?: boolean;
};

export function getPaymentResult(data: unknown): PaymentResult {
  const result = data as {
    status?: string; orderStatus?: string; paymentStatus?: string;
    pointsEarned?: number; refundStatus?: string; refundAmount?: number;
    order?: { status?: string; paymentStatus?: string };
  };
  const orderStatus = String(result?.orderStatus ?? result?.order?.status ?? result?.status ?? '').toUpperCase();
  if (orderStatus === 'CANCELLED') {
    return {
      status: 'cancelled',
      message: ['PENDING', 'SUCCEEDED', 'NEEDS_REVIEW'].includes(result.refundStatus ?? '')
        ? refundMessage(result.refundStatus, result.refundAmount)
        : '',
      refundPending: result.refundStatus === 'PENDING',
    };
  }
  const value = String(result?.paymentStatus ?? result?.order?.paymentStatus ?? orderStatus).toUpperCase();
  if (['REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'].includes(value)) {
    const refundStatus = result.refundStatus ?? (value === 'REFUNDED' ? 'SUCCEEDED' : value === 'REFUND_FAILED' ? 'NEEDS_REVIEW' : 'PENDING');
    return { status: 'cancelled', message: refundMessage(refundStatus, result.refundAmount), refundPending: refundStatus === 'PENDING' };
  }
  if (['PAID', 'SUCCESS', 'COMPLETED', 'SUCCEEDED'].includes(value)) {
    return { status: 'success', message: `Đơn hàng đã được xác nhận thanh toán thành công.${result.pointsEarned ? ` Bạn được cộng ${result.pointsEarned.toLocaleString('vi-VN')} điểm tích lũy.` : ''}` };
  }
  if (['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'ERROR'].includes(value)) {
    return { status: 'failed', message: 'Thanh toán thất bại hoặc đã bị hủy.' };
  }
  return { status: 'pending', message: 'Đơn hàng đang chờ xác nhận thanh toán.' };
}
