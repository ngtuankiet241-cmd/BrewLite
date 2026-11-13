export interface RefundSummary {
  status: "SUCCEEDED";
  mode: "SIMULATED";
  amount: number;
  reference: string;
  completedAt: string;
}

export function isRefundSummary(value: unknown): value is RefundSummary | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const refund = value as Record<string, unknown>;
  return refund.status === "SUCCEEDED" && refund.mode === "SIMULATED" &&
    typeof refund.amount === "number" && Number.isSafeInteger(refund.amount) && refund.amount > 0 &&
    typeof refund.reference === "string" && typeof refund.completedAt === "string" &&
    Number.isFinite(Date.parse(refund.completedAt));
}

export function refundMessage(refund: RefundSummary): string {
  const amount = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(refund.amount);
  return `Đã giả lập hoàn ${amount}. Không chuyển tiền thật.`;
}
