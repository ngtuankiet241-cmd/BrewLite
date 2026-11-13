export type StaffOrderStatus =
  | "PENDING"
  | "PAID"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "PAYMENT_FAILED"
  | "CANCELLED";

export type StaffActionStatus = "PREPARING" | "CANCELLED" | "READY" | "COMPLETED";

export interface StaffOrderAction {
  status: StaffActionStatus;
  label: string;
}

export const STAFF_STATUS_LABELS: Record<StaffOrderStatus, string> = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  PREPARING: "Đang pha chế",
  READY: "Sẵn sàng giao",
  COMPLETED: "Đã giao khách",
  PAYMENT_FAILED: "Thanh toán thất bại",
  CANCELLED: "Đã hủy",
};

const STAFF_ACTIONS: Record<StaffOrderStatus, readonly StaffOrderAction[]> = {
  PENDING: [],
  PAID: [
    { status: "PREPARING", label: "Nhận đơn" },
    { status: "CANCELLED", label: "Hủy đơn" },
  ],
  PREPARING: [{ status: "READY", label: "Pha chế xong" }],
  READY: [{ status: "COMPLETED", label: "Đã giao khách" }],
  COMPLETED: [],
  PAYMENT_FAILED: [],
  CANCELLED: [],
};

export function isStaffOrderStatus(value: unknown): value is StaffOrderStatus {
  return typeof value === "string" && Object.hasOwn(STAFF_STATUS_LABELS, value);
}

export function getStaffOrderActions(status: StaffOrderStatus): readonly StaffOrderAction[] {
  return STAFF_ACTIONS[status];
}
