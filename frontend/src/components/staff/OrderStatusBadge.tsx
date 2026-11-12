import { STAFF_STATUS_LABELS, type StaffOrderStatus } from "../../lib/staff-order-status";

const STATUS_STYLES: Record<StaffOrderStatus, string> = {
  PENDING: "border-stone-200 bg-stone-100 text-stone-700",
  PAID: "border-amber-200 bg-amber-50 text-amber-900",
  PREPARING: "border-blue-200 bg-blue-50 text-blue-900",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-900",
  COMPLETED: "border-stone-200 bg-stone-100 text-stone-700",
  PAYMENT_FAILED: "border-rose-200 bg-rose-50 text-rose-800",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-800",
};

export default function OrderStatusBadge({ status }: { status: StaffOrderStatus }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{STAFF_STATUS_LABELS[status]}</span>;
}
