import { API_URL } from "../config/api";
import { isStaffOrderStatus, type StaffActionStatus, type StaffOrderStatus } from "./staff-order-status";
import type { StaffRefund } from "./staff-orders";

export interface StaffOrderItem {
  name: string;
  size: string;
  quantity: number;
  toppings: string[];
}

export interface StaffOrder {
  orderCode: string;
  status: StaffOrderStatus;
  total: number;
  createdAt: string;
  items: StaffOrderItem[];
  customer: { email: string; phone: string | null } | null;
  cancellationReason: string | null;
  refundStatus: "NONE" | "PENDING" | "SUCCEEDED" | "NEEDS_REVIEW";
  refundAmount: number;
  refunds: StaffRefund[];
}

export interface StaffOrdersResponse {
  orders: StaffOrder[];
}

export interface UpdateStaffOrderRequest {
  status: Exclude<StaffActionStatus, "CANCELLED">;
}

export interface UpdateStaffOrderResponse {
  orderCode: string;
  status: StaffActionStatus;
}

type StaffErrorKind = "http" | "unavailable" | "network" | "contract" | "storage";

export class StaffApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly kind: StaffErrorKind = "http") {
    super(message);
    this.name = "StaffApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRefund(value: unknown): value is StaffRefund {
  return isRecord(value) && typeof value.id === "string" &&
    ["PENDING", "SUCCEEDED", "NEEDS_REVIEW", "FAILED"].includes(String(value.status)) &&
    typeof value.method === "string" && isMoney(value.amount) &&
    (value.lastError === null || typeof value.lastError === "string") &&
    Number.isSafeInteger(value.attempts) && (value.attempts as number) >= 0 &&
    typeof value.nextAttemptAt === "string" && Number.isFinite(Date.parse(value.nextAttemptAt)) &&
    (value.completedAt === null || (typeof value.completedAt === "string" && Number.isFinite(Date.parse(value.completedAt)))) &&
    typeof value.canRetry === "boolean";
}

function parseOrder(value: unknown): StaffOrder {
  if (!isRecord(value) || typeof value.orderCode !== "string" || !value.orderCode ||
    !isStaffOrderStatus(value.status) || !isMoney(value.totalAmount) ||
    typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.items) || !Array.isArray(value.refunds) || !value.refunds.every(isRefund) ||
    !isMoney(value.refundAmount) ||
    !["NONE", "PENDING", "SUCCEEDED", "NEEDS_REVIEW"].includes(String(value.refundStatus)) ||
    !(value.cancellationReason === null || typeof value.cancellationReason === "string") ||
    !(value.customer === null || (isRecord(value.customer) && typeof value.customer.email === "string" &&
      (value.customer.phone === null || typeof value.customer.phone === "string")))) throw contractError();

  const items = value.items.map((item: unknown): StaffOrderItem => {
    if (!isRecord(item) || typeof item.productName !== "string" ||
      typeof item.size !== "string" || !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) <= 0 || !Array.isArray(item.toppings) ||
      !item.toppings.every((topping: unknown) => typeof topping === "string")) throw contractError();
    return { name: item.productName, size: item.size, quantity: item.quantity as number, toppings: item.toppings };
  });
  return {
    orderCode: value.orderCode, status: value.status, total: value.totalAmount,
    createdAt: value.createdAt, items,
    customer: value.customer as StaffOrder["customer"],
    cancellationReason: value.cancellationReason,
    refundStatus: value.refundStatus as StaffOrder["refundStatus"],
    refundAmount: value.refundAmount, refunds: value.refunds,
  };
}

function contractError(): StaffApiError {
  return new StaffApiError("Dữ liệu API staff không đúng hợp đồng. Vui lòng báo người phụ trách backend.", null, "contract");
}

export function asStaffApiError(error: unknown): StaffApiError {
  return error instanceof StaffApiError ? error : new StaffApiError(
    "Không thể kết nối backend. Vui lòng kiểm tra kết nối và thử tải lại.", null, "network",
  );
}

async function requestStaff(path: string, method: "GET" | "PATCH" | "POST", body?: UpdateStaffOrderRequest | { reason: string }, signal?: AbortSignal): Promise<unknown> {
  let token: string | null;
  try {
    token = localStorage.getItem("brewlite_access_token");
  } catch {
    throw new StaffApiError("Không thể đọc phiên đăng nhập. Vui lòng cho phép trình duyệt lưu dữ liệu của BrewLite.", null, "storage");
  }
  if (!token) throw new StaffApiError("Bạn cần đăng nhập bằng tài khoản nhân viên để sử dụng trang này.", 401);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw asStaffApiError(error);
  }

  let data: unknown;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok) {
    const message = isRecord(data) && typeof data.message === "string" ? data.message : "";
    if ((response.status === 404 && (method === "GET" || /^Cannot (PATCH|POST)\b/i.test(message))) || response.status === 501 || response.status === 405) {
      throw new StaffApiError("Backend staff chưa sẵn sàng: API chưa được cung cấp. Vui lòng thử lại sau khi backend triển khai.", response.status, "unavailable");
    }
    const messages: Record<number, string> = {
      400: "Yêu cầu không hợp lệ hoặc trạng thái đơn không cho phép thao tác này. Danh sách cần được tải lại.",
      401: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại bằng tài khoản nhân viên.",
      403: "Tài khoản của bạn không có quyền truy cập chức năng nhân viên.",
      404: "Không tìm thấy đơn hàng, hoặc API cập nhật staff chưa sẵn sàng. Vui lòng tải lại danh sách.",
      409: "Đơn hàng vừa được người khác cập nhật. Vui lòng xem trạng thái mới trước khi thao tác lại.",
    };
    throw new StaffApiError(messages[response.status] ?? `Backend gặp lỗi (HTTP ${response.status}). Vui lòng thử tải lại.`, response.status);
  }
  if (data === null) throw contractError();
  return data;
}

export async function fetchStaffOrders(signal?: AbortSignal): Promise<StaffOrdersResponse> {
  const orders: StaffOrder[] = [];
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const data = await requestStaff(`/staff/orders?page=${page}`, "GET", undefined, signal);
    if (!isRecord(data) || !Array.isArray(data.orders) || data.page !== page ||
      !Number.isSafeInteger(data.pageSize) || (data.pageSize as number) <= 0 ||
      !Number.isSafeInteger(data.total) || (data.total as number) < 0 ||
      data.orders.length > (data.pageSize as number)) throw contractError();
    // The team's dashboard filters and counts all orders, while the API returns pages.
    if (page === 1) pages = Math.max(1, Math.ceil((data.total as number) / (data.pageSize as number)));
    orders.push(...data.orders.map(parseOrder));
  }
  if (new Set(orders.map((order) => order.orderCode)).size !== orders.length) throw contractError();
  return { orders };
}

export async function updateStaffOrderStatus(orderCode: string, body: UpdateStaffOrderRequest, signal?: AbortSignal): Promise<UpdateStaffOrderResponse> {
  const data = await requestStaff(`/staff/orders/${encodeURIComponent(orderCode)}/status`, "PATCH", body, signal);
  if (!isRecord(data) || data.orderCode !== orderCode || data.status !== body.status) throw contractError();
  return { orderCode, status: body.status };
}

export async function cancelStaffOrder(orderCode: string, reason: string, signal?: AbortSignal): Promise<UpdateStaffOrderResponse> {
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length > 500) throw new StaffApiError("Vui lòng nhập lý do hủy từ 1 đến 500 ký tự.", 400);
  const data = await requestStaff(`/staff/orders/${encodeURIComponent(orderCode)}/cancel`, "POST", { reason: trimmed }, signal);
  if (!isRecord(data) || data.orderCode !== orderCode || data.status !== "CANCELLED") throw contractError();
  return { orderCode, status: "CANCELLED" };
}

export async function retryStaffRefund(orderCode: string, refundId: string, signal?: AbortSignal): Promise<void> {
  const data = await requestStaff(`/staff/orders/${encodeURIComponent(orderCode)}/refunds/${encodeURIComponent(refundId)}/retry`, "POST", undefined, signal);
  if (!isRecord(data) || data.refundId !== refundId || data.status !== "PENDING") throw contractError();
}
