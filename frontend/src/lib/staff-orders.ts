export type StaffRefund = {
  id: string;
  status: string;
  method: string;
  amount: number;
  lastError: string | null;
  attempts: number;
  nextAttemptAt: string;
  completedAt: string | null;
  canRetry: boolean;
};

export const refundStatusLabels: Record<string, string> = {
  PENDING: "Đang hoàn tiền",
  SUCCEEDED: "Đã hoàn",
  NEEDS_REVIEW: "Cần kiểm tra",
  FAILED: "Hoàn tiền thất bại",
};
