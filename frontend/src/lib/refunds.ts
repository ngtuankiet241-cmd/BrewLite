export function refundMessage(status?: string, amount = 0): string {
  const money = amount.toLocaleString('vi-VN') + ' ₫';
  if (status === 'SUCCEEDED') return amount > 0 ? `Đã hoàn ${money}.` : 'Đã hoàn tất xử lý điểm và ưu đãi.';
  if (status === 'PENDING') return `Đang hoàn ${money} về tài khoản đã thanh toán. Bạn không cần gửi lại yêu cầu.`;
  if (status === 'NEEDS_REVIEW') return `Khoản hoàn ${money} cần được cửa hàng kiểm tra. Vui lòng liên hệ cửa hàng với mã đơn hàng.`;
  return 'Không có khoản thanh toán cần hoàn.';
}
