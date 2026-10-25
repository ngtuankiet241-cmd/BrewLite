# Thanh toán idempotent

`POST /orders` và `POST /payments` hỗ trợ header `Idempotency-Key`.
Cả hai API yêu cầu JWT của tài khoản đặt đơn. Frontend tạo UUID cho mỗi
yêu cầu mới, lưu trong `sessionStorage` và dùng lại khi thử lại cùng giỏ/nội dung
trong tab đó. Khi đổi giỏ hoặc nội dung yêu cầu, frontend tạo khóa mới.

## Quy tắc API

- Khóa gồm 1–200 ký tự ASCII hiển thị, không chứa khoảng trắng. Khóa được
  phân biệt theo tài khoản và API; có thể dùng cùng chuỗi khóa cho bước tạo đơn
  và bước thanh toán.
- Cùng khóa và cùng nội dung: trả HTTP `201` với kết quả thành công ban đầu,
  kể cả khi ứng dụng đã khởi động lại. Không tạo
  thêm đơn/giao dịch, trừ tồn kho, dùng mã khuyến mãi hoặc trừ điểm lần nữa.
- Cùng khóa nhưng đổi nội dung: HTTP `409`. Với đơn hàng, nội dung bao gồm
  sản phẩm, số lượng, size, topping, mã khuyến mãi và điểm quy đổi.
- `POST /payments` bắt buộc có khóa, thiếu/sai khóa trả HTTP `400`.
  `POST /orders` giữ tương thích với client cũ khi không có header: mỗi lần gọi
  tạo một đơn mới. Muốn retry an toàn, client phải gửi lại khóa ban đầu.
- Yêu cầu thất bại được rollback và không lưu kết quả thành công; có thể thử
  lại cùng khóa sau khi nguyên nhân lỗi được xử lý.
- Kết quả replay là kết quả khởi tạo ban đầu, không phải trạng thái hiện tại.
  Dùng `GET /payments/status?orderCode=...` để kiểm tra trạng thái mới nhất.

Ví dụ (thay `TOKEN`, `ORDER_UUID` và `PAYMENT_UUID` bằng giá trị thực):

```http
POST /orders
Authorization: Bearer TOKEN
Idempotency-Key: ORDER_UUID
Content-Type: application/json

{"items":[{"productId":"coffee-milk","quantity":1,"sizeId":"S","toppingIds":[]}]}
```

```http
POST /payments
Authorization: Bearer TOKEN
Idempotency-Key: PAYMENT_UUID
Content-Type: application/json

{"orderCode":"ORD-..."}
```

Nếu timeout hoặc mất phản hồi, gửi lại **cùng header và body**. Không tạo UUID
mới cho mỗi lần retry.

## Bảo đảm trong PostgreSQL

`IdempotencyRequest` lưu hash SHA-256 của nội dung và phản hồi theo khóa chính
`(userId, operation, key)`. Advisory lock của transaction tuần tự hóa các yêu cầu
cùng khóa trên các instance backend. Kết quả và mọi thay đổi đơn hàng được
commit cùng transaction. Phản hồi lưu dưới dạng JSON text để giữ thứ tự các
trường form SePay đã ký. Không tự động xóa bản ghi theo thời gian.

Với một đơn hàng, khóa hàng `Order` và khóa thanh toán nội bộ `sepay:<orderId>`
giữ một giao dịch SePay ngay cả khi client gửi nhiều khóa khác nhau.
IPN lặp được xác nhận nhưng không ghi nhận thanh toán/cộng điểm lần nữa.
Việc khởi tạo chỉ tạo form SePay đã ký; ứng dụng không tự trừ tiền ngân hàng.

Tiêu chí nghiệm thu chức năng này: gửi `POST /orders` hai lần liên tiếp với
**cùng `Idempotency-Key` và cùng body**, nhận cùng `orderCode`, và database chỉ
có **một đơn hàng**. Tồn kho, điểm thưởng và lượt dùng mã chỉ bị trừ một lần.

## Chạy kiểm thử

Từ thư mục `backend`, với PostgreSQL local đã cấu hình:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd test -- src/prisma/idempotency.spec.ts
npm.cmd run test:e2e -- test/idempotency.e2e-spec.ts
```

Unit test gọi hai lần cùng khóa/nội dung và xác nhận thao tác tạo dữ liệu chỉ
chạy một lần; đồng thời kiểm tra khóa không hợp lệ, replay, xung đột payload
và lỗi ghi.
Integration test gửi HTTP tuần tự vào PostgreSQL thực. Hai app đọc cùng database
để kiểm chứng kết quả được lưu bền vững:

- Gửi đúng 2 yêu cầu tạo đơn cùng khóa/body: cả hai trả `201`, cùng `orderCode`,
  chỉ có 1 đơn và 1 bộ chi tiết đơn; tồn kho, điểm và lượt dùng mã chỉ trừ 1 lần.
- Retry giữ nguyên kết quả sau khi khởi động lại app và thay đổi giá/tồn kho.
- Lỗi lưu kết quả idempotency rollback đơn, tồn kho và điểm; retry thành công.
- Gửi 2 yêu cầu thanh toán cùng khóa/body chỉ tạo 1 giao dịch; replay sau
  thanh toán giữ nguyên trạng thái đã xử lý và không cộng điểm lần nữa.
- Payload khác trả `409`; tài khoản khác không đọc được kết quả thanh toán
  của nhau; khóa sai và thiếu xác thực bị từ chối.

Các fixture có ID riêng và được dọn sau test. Test dùng thông tin SePay giả
để ký form cục bộ, không gọi cổng thanh toán bên ngoài.

Đặt hàng đồng thời và kiểm thử không vượt tồn kho được mô tả riêng tại
[kiểm soát tồn kho](concurrent-inventory.md).
