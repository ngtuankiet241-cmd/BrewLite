# Hợp đồng API Staff của BrewLite

Bản đối chiếu frontend và backend hiện có trong repository, ngày 13/11/2026.
Tài liệu này nằm trong phạm vi frontend; không thay đổi tài liệu chung ở
`docs/staff-api-contract.md` tại root. Sự tương thích ở source không xác nhận
backend local hoặc Render đã triển khai đúng phiên bản hay database đã sẵn sàng.

## Kết nối và phân quyền

- Trang: `/staff`.
- Base URL: `src/config/api.ts`, dùng `NEXT_PUBLIC_API_URL`; nếu không có biến
  này thì dùng `https://brewlite-t5xl.onrender.com`.
- Cả hai endpoint yêu cầu `Authorization: Bearer <JWT>`.
- Frontend lấy token từ khóa localStorage `brewlite_access_token`, dùng chung
  với trang khách. Không gửi role từ frontend để quyết định quyền.
- Backend dùng `JwtAuthGuard` rồi `StaffGuard`; chỉ `STAFF` hoặc `ADMIN` trong
  database được phép gọi. `CUSTOMER` bị từ chối với 403.
- `GET /auth/me` trả role; `/account` dùng role để hiện link vào `/staff`.
  Login hiện tại không trả role trong user hoặc JWT; dashboard dựa vào kết quả
  phân quyền của API staff, không yêu cầu thay đổi login.
- Request dùng `cache: no-store`. PATCH gửi thêm `Content-Type: application/json`.
- Backend cần cho phép origin của frontend, GET/PATCH và các header
  Authorization/Content-Type qua CORS.
- Khi đổi `NEXT_PUBLIC_API_URL`, khởi động lại dev server; bản production cần
  build lại để cập nhật giá trị được đóng gói vào JavaScript phía trình duyệt.

## GET /staff/orders

HTTP 200, JSON `{ "orders": [...] }`. Không có đơn trả `{ "orders": [] }`.
Không trả mảng trần và không dùng cấu trúc của lịch sử khách hàng.

Backend hỗ trợ query `status` tùy chọn, nhận một trong bảy trạng thái dưới đây.
Frontend hiện gọi không có query và lọc danh sách tại trình duyệt. Cả hai phía
chưa có phân trang. Backend trả đơn của mọi khách, sắp theo `createdAt` giảm dần,
sau đó `id` giảm dần; frontend giữ thứ tự nhận được.

Các field bắt buộc trong response:

```ts
type OrderStatus =
  | "PENDING" | "PAID" | "PREPARING" | "READY"
  | "COMPLETED" | "PAYMENT_FAILED" | "CANCELLED";

interface StaffOrdersResponse {
  orders: StaffOrder[];
}

interface StaffOrder {
  orderCode: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  items: {
    name: string;
    size: string;
    quantity: number;
    toppings: string[];
  }[];
  refund: {
    status: "SUCCEEDED";
    mode: "SIMULATED";
    amount: number;
    reference: string;
    completedAt: string;
  } | null;
  cancellation: {
    reason: string | null;
    cancelledAt: string;
    cancelledById: string | null;
    inventoryStatus: "RESTORED" | "NEEDS_REVIEW";
    promotionReleased: boolean;
    pointsReturned: number;
    pointsReversed: number;
  } | null;
}
```

- `orderCode` không rỗng, không trùng trong danh sách.
- `total` là số hữu hạn không âm, đơn vị VND; không trả Decimal dạng chuỗi.
- Các timestamp là chuỗi ISO 8601 có múi giờ; giao diện hiển thị giờ Việt Nam.
- `quantity` là số nguyên dương; topping là tên dạng chuỗi, không phải object.
  Không có topping trả `[]`.
- `size` ưu tiên tên hiển thị từ snapshot, fallback về mã size ở đơn cũ.
- `refund` và `cancellation` phải có mặt, dùng `null` khi chưa có thông tin.
  Thiếu hai field này sẽ bị validator frontend từ chối.
- `refund.amount` là số nguyên dương VND. `SUCCEEDED` trong object này chỉ xác
  nhận hoàn tiền giả lập, không xác nhận SePay chuyển tiền thật.
- `pointsReturned` và `pointsReversed` là số điểm được ghi nhận hoàn/thu hồi;
  số dư điểm khả dụng có thể chịu tác động của cơ chế `loyaltyDebt` ở backend.
- `RESTORED` xác nhận đã hoàn nguyên liệu. `NEEDS_REVIEW` yêu cầu kiểm tra kho
  thủ công; không được thông báo đã hoàn kho thành công trong trường hợp này.

## PATCH /staff/orders/:orderCode/status

Frontend encode `orderCode` thành một URL path segment trước khi gửi.

Request nhận đơn:

```json
{
  "status": "PREPARING",
  "expectedStatus": "PAID"
}
```

Request hủy đơn:

```json
{
  "status": "CANCELLED",
  "expectedStatus": "PAID",
  "reason": "Khách yêu cầu hủy trước khi pha chế"
}
```

- `status`: `PREPARING`, `READY`, `COMPLETED` hoặc `CANCELLED`.
- `expectedStatus`: bắt buộc, là trạng thái đơn frontend đang hiển thị.
- `reason`: bắt buộc khi `status` là `CANCELLED`; sau trim phải dài 3–500 ký tự.
  Nếu gửi ở thao tác khác, backend cũng kiểm tra chuỗi theo điều kiện này.
- Frontend lấy `expectedStatus` từ đơn đang thao tác. Dialog thu thập lý do,
  giới hạn 500 ký tự và chỉ cho xác nhận khi lý do sau trim dài ít nhất 3 ký tự.
- Không gửi actor ID từ frontend; backend lấy người thao tác từ JWT.
- Backend từ chối field thừa theo ValidationPipe.

HTTP 200 với JSON có chính xác hai field nghiệp vụ:

```ts
interface UpdateStaffOrderResponse {
  orderCode: string;
  status: "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
}
```

Response phải khớp mã đơn và trạng thái yêu cầu. Frontend không chấp nhận
response rỗng 204 thay cho JSON này.

| Trạng thái hiện tại | Trạng thái yêu cầu | Thao tác |
| --- | --- | --- |
| `PAID` | `PREPARING` | Nhận đơn |
| `PAID` | `CANCELLED` | Hủy đơn, cần xác nhận và lý do |
| `PENDING` | `CANCELLED` | Hủy đơn, cần xác nhận và lý do |
| `PAYMENT_FAILED` | `CANCELLED` | Hủy đơn, cần xác nhận và lý do |
| `PREPARING` | `READY` | Pha chế xong |
| `READY` | `COMPLETED` | Đã giao khách |

Frontend không có thao tác trên `CANCELLED`/`COMPLETED`, không cho nhân viên tự
đánh dấu `PAID`. Backend kiểm tra state machine độc lập. Riêng yêu cầu hủy lặp
một đơn đã `CANCELLED` trả thành công mà không thực hiện tác động hủy lần nữa.

## Xác nhận, xung đột và lỗi

- Backend khóa dòng Order, so sánh `expectedStatus`, cập nhật có điều kiện và
  commit transaction trước khi trả thành công.
- Frontend chờ PATCH xác nhận, không tự đổi trạng thái đơn trước. Sau thành công
  gọi lại GET; danh sách hiển thị lấy từ GET.
- Khóa request đồng bộ và disable nút ngăn gửi trùng trong lúc xử lý.
- Khi PATCH trả 409, frontend báo đơn đã thay đổi và tải lại danh sách; không
  tự retry PATCH. Các lỗi PATCH khác, trừ 401/403, cũng tải lại để đối chiếu.
- Với 401/403, frontend ẩn danh sách. Khi GET tải lại thất bại, dữ liệu cũ cũng
  bị ẩn để tránh thao tác trên trạng thái không còn tin cậy.
- Không polling tự động; có nút tải lại danh sách.

| HTTP / loại lỗi | Ý nghĩa và cách hiển thị |
| --- | --- |
| `400` | Body/query/lý do hoặc chuyển trạng thái không hợp lệ |
| `401` | Thiếu JWT hoặc phiên không hợp lệ; yêu cầu đăng nhập |
| `403` | Tài khoản không có quyền STAFF/ADMIN |
| GET `404` | Báo API staff chưa sẵn sàng, không coi là danh sách rỗng |
| PATCH `404` | Báo thiếu đơn hoặc endpoint cập nhật chưa sẵn sàng |
| `409` | Đơn đã thay đổi so với trạng thái frontend đang giữ |
| `405` / `501` | Báo API chưa sẵn sàng |
| `500` và lỗi HTTP khác | Báo lỗi backend kèm HTTP status |
| Mạng/CORS | Báo lỗi kết nối; không kết luận API không tồn tại |
| JSON thành công sai schema | Báo dữ liệu không đúng hợp đồng |

Backend dùng error response Nest `{ message, error, statusCode }`, trong đó
`message` có thể là chuỗi hoặc mảng lỗi validation. Frontend chủ yếu xử lý theo
HTTP status. PATCH 404 có message `Cannot PATCH ...` được nhận diện là thiếu
route; PATCH 404 chung không phân biệt chắc chắn thiếu đơn với thiếu endpoint.

## Nghiệp vụ hủy và giới hạn kiểm thử

Backend có xử lý hoàn điểm đã dùng, thu hồi điểm đã thưởng, hoàn lượt khuyến mãi
khi phù hợp và hoàn kho theo snapshot. Khi không đủ dữ liệu kho, backend đánh
dấu `NEEDS_REVIEW`. Điểm đã thưởng nhưng đã tiêu có thể được ghi thành nợ điểm.

Hoàn tiền SePay chỉ được giả lập trong BrewLite, ghi vào `SandboxRefund` cho
giao dịch SePay thành công đủ điều kiện. Không gọi API chuyển tiền/hoàn tiền thật.
Không có `refund` không được suy ra là đã hoàn tiền; xem kết quả server trả về.

Cần kiểm thử trên môi trường backend đã đồng bộ schema/Prisma Client, có tài
khoản STAFF được cấp quyền và frontend trỏ đúng URL. Việc kiểm tra source không
thay thế GET có xác thực, kiểm thử 403 cho CUSTOMER hay kiểm thử chuyển trạng
thái/đồng thời trên đơn thử nghiệm. Không gọi PATCH trên đơn thật chỉ để xác minh
tài liệu này.

## File tham chiếu

- Frontend: `src/lib/staff-api.ts`, `src/lib/staff-order-status.ts`,
  `src/lib/refunds.ts`, `src/components/staff/StaffDashboard.tsx`,
  `src/components/staff/CancelOrderDialog.tsx`.
- Backend tại root repository: `backend/src/orders/staff-orders.controller.ts`,
  `backend/src/orders/dto/staff-order.dto.ts`, `backend/src/orders/orders.service.ts`,
  `backend/src/orders/cancellation.ts`, `backend/src/auth/staff.guard.ts`,
  `backend/src/payments/simulated-refunds.ts`, `backend/src/loyalty/loyalty.ts`.
