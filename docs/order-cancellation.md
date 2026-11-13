# Hủy đơn và hoàn tiền Sandbox

`POST /orders/:orderCode/cancel` yêu cầu Bearer JWT của chủ đơn. Body là `{}`
hoặc `{ "reason": "Đổi kế hoạch" }` (tối đa 500 ký tự). Khách chỉ được hủy đơn chưa thanh toán từ
`PENDING`, `PAYMENT_FAILED`. Đơn đã thanh toán chỉ staff được hủy qua
`POST /staff/orders/:orderCode/cancel` và phải có lý do. Từ `PREPARING` trở đi
không ai được hủy. Xem [trang quản lý staff](staff-orders.md). Đơn của
người khác/không tồn tại trả 404. Gửi lại yêu cầu đã hủy trả 200 với trạng thái
hiện tại, không hoàn lần hai. Không có API công khai cho khách tự sửa trạng thái
thanh toán hoặc xác nhận đã hoàn tiền.

Trong cùng transaction, backend khóa đơn, chuyển `CANCELLED`, lưu thời điểm/lý do,
hoàn nguyên liệu theo `ingredientsUsed` đã lưu trong snapshot từng dòng hàng
(gộp nguyên liệu của size/topping, giữ đúng định mức lúc đặt hàng dù công thức đã đổi),
tăng `Ingredient.stockVersion`, trả
lượt khuyến mãi còn tồn tại, hoàn điểm đã dùng và thu hồi điểm đã thưởng. Nếu
điểm thưởng đã tiêu, phần thiếu nằm trong `loyaltyDebt`, được bù bởi lần cộng/hoàn
điểm sau. Bất kỳ lỗi ghi dữ liệu nào đều rollback toàn bộ. Số điểm đã thưởng
ban đầu được giữ lại để tra cứu, không bị xóa khỏi lịch sử.

Khoản đã thu được ghi thành `Refund` duy nhất cho mỗi `Payment`, bằng đúng số
tiền thực trả sau giảm giá và điểm. Với đơn 0 đồng, hoàn điểm/ưu đãi và đánh dấu
hoàn tất tại chỗ, không gọi SePay. Với tiền thực trả, `Payment` chuyển
`REFUND_PENDING`; đơn đã hủy trong khi tiền đang được hoàn.

Webhook API v2 đến trễ sau khi hủy vẫn được tiếp nhận và tạo yêu cầu hoàn khoản tiền vừa thu.
Nó không mở lại đơn, không cộng điểm, không trừ kho. Webhook trùng sau khi hoàn tiền
cũng không mở lại đơn. Đơn `PAID` bị thiếu giao dịch thu tiền được báo 409 để đối
soát, tránh bỏ sót nghĩa vụ hoàn tiền.

## Cấu hình hoàn tự động

Tích hợp hiện tại chỉ chạy **Sandbox**, cùng môi trường với checkout. Thêm vào
`backend/.env` rồi khởi động lại backend:

```dotenv
SEPAY_ENV=sandbox
SEPAY_API_TOKEN=<API-v2-token-tao-trong-Test-Mode>
SEPAY_BANK_ACCOUNT_ID=<UUID-tai-khoan-nhan-tien-Sandbox>
SEPAY_WEBHOOK_API_KEY=<khoa-rieng-cua-webhook>
```

Thu và hoàn tiền cho đơn mới cùng dùng API v2 Sandbox. Cấu hình QR và webhook
ngân hàng theo [hướng dẫn SePay](sepay-sandbox.md). Không có token thì worker
không gửi lệnh. Đơn Gateway cũ được giữ để đối soát riêng.

Worker tự chạy trong backend, lấy từng yêu cầu bằng lease trong PostgreSQL;
nhiều instance dùng `FOR UPDATE SKIP LOCKED`. Lệnh gọi mạng nằm ngoài transaction
hủy đơn. Worker có thể tiếp tục sau crash/restart khi lease hết hạn (90 giây).

Khi nhận webhook, backend xác thực API Key rồi tra khoản thu trên API v2.
Kết quả phải khớp toàn bộ mã `BL...`, tài khoản, số tiền, chiều tiền vào và mã
tham chiếu ngân hàng nếu webhook có mã này. UUID giao dịch lưu duy nhất trong
`Payment.providerTransactionId`; ID số nguyên của webhook được lưu riêng.
Khi hủy, `Refund` sao chép đúng UUID và tài khoản đã ghi nhận. Worker chỉ xử lý
`method=SEPAY_V2` và kiểm tra nguồn khớp `Payment` trước khi gọi hoàn tiền.

ID giao dịch v2 được lưu duy nhất trước khi gửi lệnh. Worker gửi `refund_amount`
bằng tiền thực trả và khóa `X-Idempotency-Key = brewlite-refund:<Refund.id>`.
Timeout, lỗi mạng, 429 và 5xx giữ nguyên khóa khi thử lại. Khi có `refund_id`,
worker tra cứu kết quả, không tạo lệnh mới. Chỉ phản hồi `succeeded` có đúng ID,
số tiền, tiền tệ mới chuyển `Refund` sang `SUCCEEDED` và `Payment` sang `REFUNDED`.
Xem [API hoàn giao dịch](https://developer.sepay.vn/vi/sepay-api/v2/hoan-tien/hoan-tien-giao-dich)
và [tra cứu kết quả](https://developer.sepay.vn/vi/sepay-api/v2/hoan-tien/chi-tiet).

Lỗi tạm thời có backoff, sau 8 lần lỗi chuyển `NEEDS_REVIEW`. Lỗi cấu hình/nghiệp
vụ không thể tự thử lại cũng chuyển `NEEDS_REVIEW`; ngân hàng xác nhận thất bại
chuyển `FAILED`. Không trạng thái nào trong số này được coi là đã trả tiền.

## Theo dõi và khôi phục

Lịch sử đơn và `/payments/status` trả `refundStatus` (`NONE`, `PENDING`,
`SUCCEEDED`, `NEEDS_REVIEW`) và `refundAmount`. Giao diện ưu tiên `CANCELLED`
so với trạng thái thanh toán cũ; hiển thị khoản đang hoàn/đã hoàn/cần kiểm tra.

Người vận hành có quyền truy cập backend có thể xem yêu cầu đang tồn đọng:

```powershell
npm.cmd --prefix backend run refunds -- list
```

Chạy từ thư mục `backend` để CLI nạp đúng `.env`. Sau khi sửa nguyên nhân,
thử lại một yêu cầu `NEEDS_REVIEW` bằng khóa cũ:

```powershell
npm.cmd run refunds -- retry <refund-id>
```

CLI không cho sửa số tiền, mã giao dịch hay đánh dấu đã hoàn. `FAILED` là kết quả
cuối từ SePay và cần đối soát với nhà cung cấp; không tự sinh khóa mới để chi tiếp.
Đơn đã `CANCELLED` trước migration không tự chạy bù nghiệp vụ hoặc gửi tiền.

### Cảnh báo `original_transaction_not_found`

Lỗi này hiện xuất hiện khi webhook chưa đối chiếu được khoản thu trên API v2;
backend trả 503 để SePay thử lại webhook. Worker không còn tìm theo mã Gateway.
Khoản Gateway cũ giữ `NEEDS_REVIEW`; CLI chỉ retry `method=SEPAY_V2`.
Kiểm tra token, tài khoản và nguồn tiền; không tạo giao dịch thay thế hoặc đánh
dấu đã hoàn tiền chỉ để bỏ cảnh báo.

Thời gian chờ sau lỗi lần lượt là 30 giây, 60 giây, 120 giây… (tối đa 1 giờ).
Log ghi số lần thất bại, thời điểm thử lại theo UTC hoặc `NEEDS_REVIEW` nếu đã
dừng tự động. Các cột lịch xử lý và lease lưu UTC dưới dạng `TIMESTAMP(3)`;
truy vấn worker phải so sánh với `NOW() AT TIME ZONE 'UTC'`, tránh thử lại liên
tục hoặc lấy trùng lease khi PostgreSQL dùng múi giờ UTC+7.

## Migration và kiểm thử

Từ `backend/`:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd test
npm.cmd run test:payments
```

Test tích hợp tạo schema riêng trong PostgreSQL, dùng fake credentials và mock
HTTP cho hoàn tiền; không chuyển tiền thật. Bao gồm hủy đồng thời, tranh chấp với
pha chế/thanh toán, rollback, hoàn điểm/tồn kho/mã giảm giá, điểm đã tiêu, đơn
0 đồng, callback muộn/trùng, lost response, retry cùng khóa và kết quả hoàn lỗi.
Kiểm thử SePay Sandbox thật cần cấu hình API v2, webhook ngân hàng và một giao
dịch Sandbox có thể đối soát như trong hướng dẫn thiết lập.
