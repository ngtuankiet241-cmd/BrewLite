import type { StaffOrder } from "../../lib/staff-api";
import { getStaffOrderActions, type StaffActionStatus } from "../../lib/staff-order-status";
import OrderStatusBadge from "./OrderStatusBadge";
import { refundMessage } from "../../lib/refunds";

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});

interface StaffOrderCardProps {
  order: StaffOrder;
  disabled: boolean;
  processing: boolean;
  onAction: (order: StaffOrder, status: StaffActionStatus) => void;
}

export default function StaffOrderCard({ order, disabled, processing, onAction }: StaffOrderCardProps) {
  const actions = getStaffOrderActions(order.status);
  return (
    <article aria-label={`Đơn ${order.orderCode}`} aria-busy={processing} className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Mã đơn</p>
            <h2 className="mt-1 break-all text-base font-bold text-stone-900">{order.orderCode}</h2>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-3 text-xs text-stone-500">Đặt lúc <time dateTime={order.createdAt}>{dateTime.format(new Date(order.createdAt))}</time> · Giờ Việt Nam</p>
      </div>
      <ul className="flex-1 divide-y divide-stone-100 px-5" aria-label="Các món trong đơn">
        {order.items.map((item, index) => (
          <li key={index} className="flex gap-3 py-4">
            <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 px-2 text-sm font-bold text-stone-700" aria-label={`Số lượng ${item.quantity}`}>{item.quantity}×</span>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-stone-900">{item.name}</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">Size: {item.size}</p>
              <p className="break-words text-xs leading-5 text-stone-500">{item.toppings.length ? `Topping: ${item.toppings.join(", ")}` : "Không thêm topping"}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-stone-100 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-stone-600">Tổng tiền</span>
          <strong className="text-lg text-emerald-950">{money.format(order.total)}</strong>
        </div>
        {order.cancellation && <div className="mt-4 space-y-2 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-700">
          <p><strong>Lý do hủy:</strong> {order.cancellation.reason}</p>
          <p>Hủy lúc {dateTime.format(new Date(order.cancellation.cancelledAt))} · Giờ Việt Nam</p>
          <p>{order.refund ? refundMessage(order.refund) : "Chưa ghi nhận khoản thanh toán cần hoàn. Nếu thanh toán đến sau, hệ thống sẽ tự giả lập hoàn tiền."}</p>
          {order.refund && <p className="break-all">Mã hoàn: {order.refund.reference}</p>}
          <p className={order.cancellation.inventoryStatus === "NEEDS_REVIEW" ? "font-semibold text-amber-800" : ""}>{order.cancellation.inventoryStatus === "RESTORED" ? "Đã hoàn nguyên liệu về kho." : "Cần kiểm tra kho thủ công: chưa đủ dữ liệu xác nhận hoàn nguyên liệu."}</p>
          {order.cancellation.promotionReleased && <p>Đã hoàn lượt mã giảm giá.</p>}
          <p>Đã trả {order.cancellation.pointsReturned} điểm đã dùng; thu hồi {order.cancellation.pointsReversed} điểm tích lũy.</p>
        </div>}
        {actions.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <button key={action.status} type="button" disabled={disabled} onClick={() => onAction(order, action.status)}
                className={`min-h-11 flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${action.status === "CANCELLED" ? "border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-rose-700" : "bg-emerald-800 text-white hover:bg-emerald-900 focus-visible:outline-emerald-800"}`}>
                {action.label}
              </button>
            ))}
          </div>
        ) : <p className="mt-4 text-xs text-stone-500">{order.status === "COMPLETED" || order.status === "CANCELLED" ? "Đơn đã kết thúc · Không có thao tác" : "Chưa có thao tác dành cho nhân viên"}</p>}
        {processing && <p role="status" className="mt-3 text-xs text-emerald-800">Đang xử lý, vui lòng chờ xác nhận...</p>}
      </div>
    </article>
  );
}
