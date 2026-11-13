# Hủy đơn và hoàn tiền giả lập

Thanh toán giữ nguyên **SePay Payment Gateway Sandbox** qua `sepay-pg-node`.
Khách thanh toán trên form `https://pay-sandbox.sepay.vn/v1/checkout/init`;
backend chỉ xác nhận từ IPN đã kiểm tra secret, invoice, trạng thái CAPTURED /
APPROVED, tiền VND và số tiền. Browser redirect không xác nhận thanh toán.

Hoàn tiền được giả lập trong BrewLite. Không gọi API hoàn tiền/chuyển khoản;
không cần API key giao dịch ngân hàng hay tài khoản ngân hàng để hoàn tiền.
Tham khảo [Sandbox](https://developer.sepay.vn/vi/cong-thanh-toan/sandbox),
[SDK](https://developer.sepay.vn/vi/cong-thanh-toan/sdk/nodejs) và
[IPN](https://developer.sepay.vn/vi/cong-thanh-toan/IPN).

## Chạy và cấp quyền nhân viên

Từ `backend/`, dùng `.env` đã cấu hình Gateway Sandbox theo
[hướng dẫn SePay](sepay-sandbox.md):

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd run staff:grant -- ten-nhan-vien@example.com
npm.cmd run start:dev
```

Có thể thay email bằng số điện thoại đã đăng ký. Lệnh chỉ cấp quyền cho tài khoản
đã có, không tạo mật khẩu mặc định. Đăng nhập tài khoản này, mở `/staff` hoặc
chọn **Quản lý đơn hàng** trong `/account`. Đăng ký công khai luôn tạo CUSTOMER;
API staff kiểm tra role trong database mỗi lần gọi, kể cả khi JWT còn hiệu lực.

Khi chạy local, tạo `frontend/.env.local` từ `frontend/.env.example` và đặt
`NEXT_PUBLIC_API_URL=http://localhost:3001`, rồi khởi động lại frontend bằng
`npm.cmd --prefix frontend run dev`. Nếu dùng `next start`, build lại sau khi
đổi biến này. Biến trỏ về backend remote sẽ gọi phiên bản API đã deploy trên
remote đó, không dùng code backend đang chạy tại máy.

Migration thêm dữ liệu và bảng `SandboxRefund`. Nếu database đã từng chạy bản
SePay v2 trước khi revert, các cột role/loyaltyDebt/cancellation có sẵn được giữ
lại và bảng `Refund` cũ không bị sửa/xóa. Không reset database hay chạy lại
migration cũ. Các bản ghi hoàn tiền cũ không được chuyển thành hoàn tiền giả lập.

## Quy tắc nghiệp vụ

Nhân viên có thể hủy PENDING, PAYMENT_FAILED hoặc PAID, trước khi pha chế.
PREPARING, READY, COMPLETED không được hủy. Luồng nhận đơn vẫn là
PAID → PREPARING → READY → COMPLETED. Nhân viên không được tự đánh dấu PAID.

Hủy phải có lý do 3–500 ký tự sau khi bỏ khoảng trắng đầu/cuối.
Trong một transaction, hệ thống:

1. Khóa hàng Order, kiểm tra trạng thái rồi chuyển CANCELLED, lưu người/lý do/thời gian hủy.
2. Hoàn nguyên liệu theo `OrderItem.snapshot.ingredientsUsed` lúc đặt, gồm topping;
   tăng stockVersion. Không dùng công thức hiện tại vì công thức có thể đã thay đổi.
3. Hoàn một lượt mã giảm giá nếu mã còn tồn tại và usedCount > 0; không cho âm.
4. Trả điểm đã quy đổi và thu hồi điểm tích lũy của đơn đúng một lần. Nếu điểm
   đã tiêu hết, ghi `User.loyaltyDebt`, giữ số dư dùng được không âm; các khoản
   cộng/trả điểm tiếp theo bù nợ trước. `/account` hiển thị khoản cần thu hồi.
5. Nếu đã thu tiền Gateway thành công và amount > 0, tạo một bản ghi
   `SandboxRefund` với mode SIMULATED, status SUCCEEDED, số tiền đúng bằng khoản
   thực trả sau mọi giảm giá và reference `SIM-REFUND-<paymentId>`.

Đơn chưa trả tiền hoặc được điểm/mã giảm giá thanh toán toàn bộ không tạo hoàn
tiền mặt. `Payment.status` vẫn là SUCCEEDED nếu đã thu tiền; `refund` là kết quả
giả lập độc lập. Không báo với khách rằng SePay đã chuyển tiền thật.

Nếu bất kỳ bước nào lỗi, toàn bộ transaction rollback. Gọi hủy lại đơn đã hủy
trả thành công nhưng không hoàn kho/điểm/mã/tiền lần nữa và giữ nguyên người/lý
do hủy đầu tiên. Unique orderId/paymentId ngăn bản ghi hoàn tiền trùng.

Đơn cũ thiếu snapshot nguyên liệu được đánh dấu NEEDS_REVIEW và hiển thị yêu
cầu kiểm tra kho thủ công; không đoán số lượng để nhập kho. Các đơn đã hủy từ
trước migration cũng được đánh dấu để kiểm tra, không tự hoàn kho lần nữa.

Nếu IPN hợp lệ đến sau hủy (khách đã mở form thanh toán trước đó), hệ thống giữ
CANCELLED, lưu giao dịch thành công và tự ghi hoàn tiền giả lập một lần. Không
cộng điểm mới, không khôi phục đơn. IPN, khởi tạo thanh toán và hủy dùng chung
khóa Order để tránh trạng thái bị ghi đè khi chạy đồng thời.

## API

- `GET /staff/orders?status=CANCELLED`: JWT + STAFF/ADMIN. Bộ lọc status tùy chọn.
  Trả `{ orders: [...] }`, mỗi đơn có orderCode, status, total, createdAt, items,
  refund (null hoặc kết quả SIMULATED) và cancellation (lý do, người/thời gian,
  kết quả kho, lượt mã giảm giá và điểm).
- `PATCH /staff/orders/:orderCode/status`: JWT + STAFF/ADMIN. Ví dụ:

```json
{
  "status": "CANCELLED",
  "expectedStatus": "PAID",
  "reason": "Khách yêu cầu hủy trước khi pha chế"
}
```

Trả `{ orderCode, status }`. Trạng thái đã đổi trả 409, thiếu quyền trả 403,
thiếu JWT trả 401, chuyển trạng thái/lý do không hợp lệ trả 400, đơn không có
trả 404. Client tải lại danh sách để xem kết quả đã được server xác nhận.

`GET /orders/history` và `GET /payments/status` của chủ đơn trả `refund`,
`pointsRefunded`, `pointsReversed` và thông tin hủy. Trang kết quả ưu tiên trạng
thái CANCELLED ngay cả khi paymentStatus vẫn SUCCEEDED.

## Kiểm thử

`backend/test/staff-cancellation.e2e-spec.ts` dùng PostgreSQL và local HTTP với
credentials giả; không gửi yêu cầu tới SePay. Chạy trên database kiểm thử riêng
đã migrate và seed:

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix backend run test:e2e
npm.cmd --prefix backend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
```

Các test kiểm tra phân quyền/thu hồi quyền, hủy đồng thời, callback trùng/đến
muộn, hủy chạy cùng thanh toán, kho từ snapshot, khuyến mãi, điểm và nợ điểm,
đơn được điểm thanh toán toàn bộ, trạng thái không được hủy và rollback khi lưu
hoàn tiền lỗi. Kiểm thử cổng Sandbox thật cần merchant credentials và HTTPS IPN
công khai như hướng dẫn SePay.
