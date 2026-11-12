import { API_URL } from "../config/api";
import { isStaffOrderStatus, type StaffActionStatus, type StaffOrderStatus } from "./staff-order-status";

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
}

export interface StaffOrdersResponse {
  orders: StaffOrder[];
}

export interface UpdateStaffOrderRequest {
  status: StaffActionStatus;
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

function isOrderItem(value: unknown): value is StaffOrderItem {
  return isRecord(value) && typeof value.name === "string" &&
    typeof value.size === "string" && Number.isSafeInteger(value.quantity) &&
    (value.quantity as number) > 0 && Array.isArray(value.toppings) &&
    value.toppings.every((topping: unknown) => typeof topping === "string");
}

function isOrder(value: unknown): value is StaffOrder {
  return isRecord(value) && typeof value.orderCode === "string" && value.orderCode.length > 0 &&
    isStaffOrderStatus(value.status) && typeof value.total === "number" &&
    Number.isFinite(value.total) && value.total >= 0 && typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) && Array.isArray(value.items) && value.items.every(isOrderItem);
}

function contractError(): StaffApiError {
  return new StaffApiError("Dữ liệu API staff không đúng hợp đồng. Vui lòng báo người phụ trách backend.", null, "contract");
}

export function asStaffApiError(error: unknown): StaffApiError {
  return error instanceof StaffApiError ? error : new StaffApiError(
    "Không thể kết nối backend. Vui lòng kiểm tra kết nối và thử tải lại.", null, "network",
  );
}

async function requestStaff(path: string, method: "GET" | "PATCH", body?: UpdateStaffOrderRequest, signal?: AbortSignal): Promise<unknown> {
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
    if ((response.status === 404 && (method === "GET" || /^Cannot PATCH\b/i.test(message))) || response.status === 501 || response.status === 405) {
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
  const data = await requestStaff("/staff/orders", "GET", undefined, signal);
  if (!isRecord(data) || !Array.isArray(data.orders) || !data.orders.every(isOrder)) throw contractError();
  if (new Set(data.orders.map((order: StaffOrder) => order.orderCode)).size !== data.orders.length) throw contractError();
  return { orders: data.orders };
}

export async function updateStaffOrderStatus(orderCode: string, body: UpdateStaffOrderRequest, signal?: AbortSignal): Promise<UpdateStaffOrderResponse> {
  const data = await requestStaff(`/staff/orders/${encodeURIComponent(orderCode)}/status`, "PATCH", body, signal);
  if (!isRecord(data) || data.orderCode !== orderCode || data.status !== body.status) throw contractError();
  return { orderCode, status: body.status };
}
