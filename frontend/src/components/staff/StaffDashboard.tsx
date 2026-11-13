"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { asStaffApiError, fetchStaffOrders, StaffApiError, updateStaffOrderStatus, type StaffOrder } from "../../lib/staff-api";
import { getStaffOrderActions, STAFF_STATUS_LABELS, type StaffActionStatus, type StaffOrderStatus } from "../../lib/staff-order-status";
import CancelOrderDialog from "./CancelOrderDialog";
import StaffOrderCard from "./StaffOrderCard";

type Filter = "ALL" | StaffOrderStatus;
const FILTERS: Filter[] = ["ALL", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED", "PENDING", "PAYMENT_FAILED"];

function ErrorNotice({ error }: { error: StaffApiError }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
      <p className="font-bold">{error.kind === "unavailable" ? "Backend staff chưa sẵn sàng" : error.status === 403 ? "Không có quyền truy cập" : error.status === 401 ? "Cần đăng nhập nhân viên" : error.status === 409 ? "Trạng thái đơn đã thay đổi" : error.status === 400 ? "Không thể thực hiện thao tác" : error.status === 404 ? "Không tìm thấy đơn hoặc API" : "Không thể hoàn tất yêu cầu"}</p>
      <p className="mt-1">{error.message}</p>
      {error.status === 401 && <Link href="/" className="mt-3 inline-block font-semibold underline underline-offset-4">Về trang chủ để đăng nhập</Link>}
    </div>
  );
}

export default function StaffDashboard() {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [listError, setListError] = useState<StaffApiError | null>(null);
  const [actionError, setActionError] = useState<StaffApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [cancelOrder, setCancelOrder] = useState<StaffOrder | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // A synchronous lock also blocks a second click before React renders disabled buttons.
  const requestLock = useRef(false);
  const lifetime = useRef<AbortController | null>(null);

  const reloadOrders = useCallback((signal: AbortSignal) => {
    return fetchStaffOrders(signal).then((result) => {
      if (signal.aborted) return;
      setOrders(result.orders);
      setHasLoaded(true);
      setLastUpdated(new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date()));
    }).catch((error: unknown) => {
      if (signal.aborted) return;
      // Hide old data when refresh fails so stale orders cannot be acted on.
      setOrders([]);
      setHasLoaded(false);
      setLastUpdated(null);
      setListError(asStaffApiError(error));
    }).finally(() => {
      if (!signal.aborted) setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    requestLock.current = true;
    void reloadOrders(controller.signal).finally(() => {
      if (!controller.signal.aborted) requestLock.current = false;
    });
    return () => {
      controller.abort();
      requestLock.current = false;
    };
  }, [reloadOrders]);

  async function refresh() {
    const signal = lifetime.current?.signal;
    if (requestLock.current || !signal || signal.aborted) return;
    requestLock.current = true;
    setActionError(null);
    setNotice("");
    setIsLoading(true);
    setListError(null);
    try { await reloadOrders(signal); }
    finally { if (!signal.aborted) requestLock.current = false; }
  }

  async function updateOrder(order: StaffOrder, status: StaffActionStatus, reason?: string) {
    const signal = lifetime.current?.signal;
    if (requestLock.current || !signal || signal.aborted) return;
    if (!getStaffOrderActions(order.status).some((action) => action.status === status)) return;
    requestLock.current = true;
    setPendingCode(order.orderCode);
    setActionError(null);
    setNotice("");
    setCancelOrder(null);
    try {
      const confirmed = await updateStaffOrderStatus(order.orderCode, { status, expectedStatus: order.status, ...(reason ? { reason } : {}) }, signal);
      if (signal.aborted) return;
      setNotice(`Đã cập nhật đơn ${confirmed.orderCode}: ${STAFF_STATUS_LABELS[confirmed.status]}.${status === "CANCELLED" ? " Xem kết quả hoàn tiền giả lập và xử lý sau hủy trên thẻ đơn." : ""}`);
      // Never change an order locally ahead of the server. GET remains the list's source of truth.
      setIsLoading(true);
      setListError(null);
      await reloadOrders(signal);
    } catch (error) {
      if (signal.aborted) return;
      const apiError = asStaffApiError(error);
      if (apiError.status === 401 || apiError.status === 403) {
        setOrders([]);
        setHasLoaded(false);
        setLastUpdated(null);
        setListError(apiError);
      } else {
        setActionError(apiError);
        // A lost response may hide a committed write; reconcile without retrying PATCH.
        setIsLoading(true);
        setListError(null);
        await reloadOrders(signal);
      }
    } finally {
      if (!signal.aborted) {
        requestLock.current = false;
        setPendingCode(null);
      }
    }
  }

  function handleAction(order: StaffOrder, status: StaffActionStatus) {
    if (requestLock.current) return;
    if (status === "CANCELLED") setCancelOrder(order);
    else void updateOrder(order, status);
  }

  const busy = isLoading || pendingCode !== null;
  const visibleOrders = orders.filter((order) => filter === "ALL" || order.status === filter);

  return (
    <main className="min-h-screen bg-[#F6F5F1] text-stone-800">
      <header className="bg-emerald-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-5">
            <Link href="/" className="text-xl font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4">BrewLite<span className="ml-3 text-xs font-medium tracking-normal text-emerald-200">Không gian nhân viên</span></Link>
            <Link href="/" className="text-sm text-emerald-100 underline-offset-4 hover:underline">Về trang chủ ↗</Link>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Quản lý đơn tại quầy</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Đơn hàng</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100">Tiếp nhận đơn đã thanh toán, theo dõi pha chế và xác nhận giao khách.</p>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={busy || cancelOrder !== null} className="min-h-11 rounded-xl border border-emerald-700 bg-emerald-900 px-5 py-3 text-sm font-semibold hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50">{isLoading ? "Đang tải..." : "Tải lại danh sách"}</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {hasLoaded && !listError && (
          <section aria-label="Tổng quan đơn hàng" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              { label: "Tất cả đơn", status: "ALL", value: orders.length },
              { label: "Chờ nhận", status: "PAID", value: orders.filter((order) => order.status === "PAID").length },
              { label: "Đang pha chế", status: "PREPARING", value: orders.filter((order) => order.status === "PREPARING").length },
              { label: "Sẵn sàng giao", status: "READY", value: orders.filter((order) => order.status === "READY").length },
            ] as const).map((summary) => (
              <button type="button" key={summary.status} onClick={() => setFilter(summary.status)} aria-pressed={filter === summary.status} className={`rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 ${filter === summary.status ? "border-emerald-800 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-500"}`}>
                <span className="text-xs font-medium text-stone-600">{summary.label}</span>
                <span className="mt-2 block text-3xl font-bold tabular-nums text-emerald-950">{summary.value}</span>
              </button>
            ))}
          </section>
        )}

        {notice && <p role="status" className="break-words rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">{notice}</p>}
        {actionError && <ErrorNotice error={actionError} />}
        {listError && <ErrorNotice error={listError} />}

        {hasLoaded && !listError && (
          <div className="space-y-3">
            <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
              {FILTERS.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-full border px-4 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 ${filter === value ? "border-emerald-900 bg-emerald-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-emerald-700"}`}>{value === "ALL" ? "Tất cả" : STAFF_STATUS_LABELS[value]}</button>)}
            </div>
            <p className="text-xs leading-5 text-stone-500">{visibleOrders.length} đơn{lastUpdated ? ` · Cập nhật lúc ${lastUpdated} (giờ Việt Nam)` : ""} · Dùng “Tải lại danh sách” để xem thay đổi mới.</p>
          </div>
        )}

        <div aria-busy={busy}>
          {isLoading && <div role="status" className="mb-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-emerald-800 motion-reduce:animate-none" />{pendingCode ? "Đang tải lại đơn hàng từ máy chủ..." : "Đang tải danh sách đơn hàng..."}</div>}

          {hasLoaded && !listError && visibleOrders.length > 0 && <section aria-label="Danh sách đơn hàng" className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">{visibleOrders.map((order) => <StaffOrderCard key={order.orderCode} order={order} disabled={busy || cancelOrder !== null} processing={pendingCode === order.orderCode} onAction={handleAction} />)}</section>}

          {hasLoaded && !isLoading && !listError && visibleOrders.length === 0 && <section className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center"><p className="text-3xl" aria-hidden="true">☕</p><h2 className="mt-4 text-lg font-bold text-stone-800">{orders.length === 0 ? "Chưa có đơn hàng" : "Không có đơn ở trạng thái này"}</h2><p className="mt-2 text-sm text-stone-500">{orders.length === 0 ? "Đơn hàng sẽ xuất hiện tại đây khi được ghi nhận trên hệ thống." : "Chọn trạng thái khác hoặc tải lại danh sách để kiểm tra."}</p></section>}
        </div>

        <p className="border-t border-stone-200 pt-5 text-xs leading-6 text-stone-500">Thanh toán dùng SePay Payment Gateway Sandbox. Hoàn tiền được giả lập trong BrewLite, không chuyển tiền thật. Chỉ hủy đơn trước khi bắt đầu pha chế.</p>
      </div>

      {cancelOrder && <CancelOrderDialog orderCode={cancelOrder.orderCode} onClose={() => setCancelOrder(null)} onConfirm={(reason) => void updateOrder(cancelOrder, "CANCELLED", reason)} />}
    </main>
  );
}
