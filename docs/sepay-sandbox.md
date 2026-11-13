# Thiết lập SePay API v2 Sandbox cho BrewLite

Các đơn mới dùng QR chuyển khoản, webhook ngân hàng và API v2 cho cả thu và hoàn
tiền. Trang thanh toán nằm tại `/payment/checkout` trong BrewLite. Backend đối
chiếu khoản thu trên API v2, lưu UUID giao dịch, rồi dùng chính UUID đó để hoàn.

## 1. Tài khoản và API token

1. Đăng nhập [my.sepay.vn](https://my.sepay.vn), bật **Test mode** ở sidebar.
2. Trong **Tài khoản ngân hàng**, tạo/chọn tài khoản Test mode nhận chuyển khoản
   trực tiếp. Không chọn tài khoản chỉ nhận qua VA. Tài khoản Sandbox hiện có
   vẫn dùng được nếu API cho phép; có thể chọn VietinBank doanh nghiệp để thử
   luồng thu và hoàn.
3. Trong **API Access** của Test mode, tạo API token đang hoạt động.
4. Lấy UUID tài khoản ngân hàng: trường `id` trong API v2, khác số tài khoản và
   khác ID số nguyên của webhook.

[Test mode](https://developer.sepay.vn/vi/tien-ich-khac/test-mode),
[tạo API token](https://developer.sepay.vn/vi/sepay-api/v2/tao-api-token),
[chi tiết tài khoản](https://developer.sepay.vn/vi/sepay-api/v2/tai-khoan-ngan-hang/chi-tiet).

## 2. Cấu hình BrewLite

Giữ các biến database/JWT và đặt các giá trị sau trong `backend/.env`:

```dotenv
SEPAY_ENV=sandbox
SEPAY_API_TOKEN="<API-token-Test-mode>"
SEPAY_BANK_ACCOUNT_ID="<UUID-tai-khoan-Test-mode>"
SEPAY_WEBHOOK_API_KEY="<khoa-ngau-nhien-rieng-cho-webhook>"
FRONTEND_URL="http://localhost:3000"
```

`SEPAY_API_TOKEN` dùng để gọi API v2. `SEPAY_WEBHOOK_API_KEY` là khóa riêng bạn
đặt để xác thực webhook. Không đưa các khóa này vào Git hoặc frontend.

Mã vẫn đọc `SEPAY_REFUND_API_TOKEN` và `SEPAY_REFUND_BANK_ACCOUNT_ID` làm giá trị
dự phòng cho cấu hình cũ; nên dùng tên mới ở trên. Checkout mới không cần
merchant ID/merchant secret. Giữ `SEPAY_IPN_SECRET_KEY` nếu còn nhận IPN Gateway cũ.

Từ thư mục `backend`:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd run start:dev
```

Nếu Windows báo đang khóa `query_engine-windows.dll.node`, dừng backend bằng
Ctrl+C, chạy lại `prisma generate`, rồi khởi động backend. Không reset database.

Trong terminal khác, từ thư mục `frontend`:

```powershell
npm.cmd run dev
```

Nếu chạy Docker Compose, đặt các biến API v2 trong `.env` ở **gốc repository**
để Compose truyền vào container. `backend/.env` dùng khi chạy Node trực tiếp.

## 3. Mở backend công khai

Khi backend chạy trực tiếp ở cổng 3001, mở tunnel:

```powershell
ngrok http 3001
```

Nếu ngrok chạy trong container, upstream có thể là `host.docker.internal:3001`.
Giữ backend và tunnel chạy trong lúc thử. Sao chép URL HTTPS được cấp. Mỗi lần
đổi tên miền tunnel, cập nhật lại URL webhook trong SePay.

## 4. Tạo webhook Test mode

Vào **Test mode → Tích hợp Webhook → Thêm webhook**:

| Trường | Giá trị |
| --- | --- |
| Tên webhook | `BrewLite API v2 Sandbox` |
| URL nhận webhook | `https://<ten-mien-tunnel>/payments/webhook` |
| Loại giao dịch | **Tiền vào** |
| Định dạng dữ liệu | **JSON** (`application/json`) |
| Tự động gửi lại khi server trả lỗi | **Bật** |
| Tài khoản ngân hàng | Chọn đúng tài khoản có UUID trong `SEPAY_BANK_ACCOUNT_ID` |
| Chỉ gửi khi có mã thanh toán | **Tắt** khi thiết lập ban đầu |
| Lọc theo mã thanh toán | Để trống |
| Phương thức xác thực | **API Key** |
| Giá trị API Key | Giá trị `SEPAY_WEBHOOK_API_KEY` trong `backend/.env` |

Nếu bật mục **Dùng để xác thực thanh toán**, vẫn tắt **Chỉ gửi khi có mã thanh
toán** và không giới hạn tiền tố. Backend tự đối chiếu toàn bộ mã `BL...` trong
nội dung, không phụ thuộc chức năng nhận diện mã của SePay.

SePay gửi `Authorization: Apikey <gia-tri-khoa>`. Trong ô API Key của dashboard,
chỉ điền giá trị khóa, không thêm chữ `Apikey` hoặc dấu ngoặc kép.
Webhook hợp lệ được trả HTTP 200 với `{ "success": true }`, không cần JWT khách.

`/payments/ipn` chỉ phục vụ Gateway cũ. Không nhập `localhost` hoặc URL frontend
cổng 3000 vào ô webhook này.

[Tạo webhook](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/tao-webhook),
[xác thực API Key](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc).

## 5. Thử thu tiền và hoàn tiền

1. Tạo **đơn mới** trong BrewLite, bấm **Thanh toán QR (Sandbox)**.
2. Trang QR hiển thị tài khoản, số tiền và nội dung `BL` + 24 ký tự. Sao chép
   toàn bộ nội dung này; không dùng mã `ORD-...` hoặc mã Gateway `PAY...`.
3. Trong **SePay Test mode → Mô phỏng giao dịch**, chọn đúng tài khoản,
   **Tiền vào**, đúng số tiền và nội dung `BL...`. Tạo một giao dịch cho mỗi
   lần kiểm thử thanh toán. Không chuyển tiền thật vào QR.
4. Trong chi tiết giao dịch SePay, kiểm tra webhook tới `/payments/webhook`
   trả HTTP 200. Trang QR tự kiểm tra backend mỗi 5 giây và chuyển sang kết quả
   khi backend đã xác nhận khoản thu.
5. Với đơn đã thanh toán, đăng nhập tài khoản staff và vào **Quản lý đơn hàng →
   Hủy đơn hàng**, nhập lý do rồi xác nhận trước khi đơn sang `PREPARING`.
   Khách chỉ tự hủy được đơn chưa trả tiền. Yêu cầu hoàn tiền lưu chính UUID
   giao dịch API v2 vừa thu. Xem [cấp quyền và thao tác staff](staff-orders.md).
6. Worker gửi hoàn tiền và theo dõi kết quả. Chỉ khi SePay trả `succeeded`,
   BrewLite mới hiển thị **Đã hoàn**. Xem ở **Kiểm tra trạng thái hoàn tiền**.

Sandbox cần mô phỏng khoản thu. Bấm thanh toán chỉ tạo thông tin chuyển khoản,
không tự ghi nhận đã trả tiền. Nút **Kiểm tra trạng thái** đọc trạng thái backend,
không thay cho webhook bị thiếu. Nếu webhook lỗi, sửa cấu hình rồi dùng **Phát
lại** tại log giao dịch SePay.

[Mô phỏng giao dịch](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-giao-dich),
[hoàn theo giao dịch](https://developer.sepay.vn/vi/sepay-api/v2/hoan-tien/hoan-tien-giao-dich).

## 6. Đơn Gateway cũ

Đơn đã khởi tạo Gateway không tự chuyển sang API v2. Hủy đơn Gateway chưa trả
tiền rồi đặt đơn mới. Khoản Gateway đã thu được giữ để đối soát; worker API v2
không hoàn bằng một giao dịch mô phỏng thay thế. Migration chuyển yêu cầu Gateway
cũ đang chờ sang `NEEDS_REVIEW` và giữ dữ liệu. CLI không retry các khoản này.

## Xử lý lỗi

| Hiện tượng | Cách kiểm tra |
| --- | --- |
| Không tạo được QR | Token Test mode, UUID tài khoản đang hoạt động, khóa webhook; khởi động lại backend sau khi sửa `.env` |
| Webhook 401 | Chọn **API Key**, khớp `SEPAY_WEBHOOK_API_KEY`; không dùng merchant secret/API token thay thế |
| Không có webhook phù hợp | Chọn đúng tài khoản, **Tiền vào**, bỏ bộ lọc mã; tạo webhook trước khi mô phỏng hoặc phát lại log đã có |
| Webhook 400 | Số tiền/tài khoản sai hoặc nhiều mã `BL...`; kiểm tra giao dịch |
| Webhook 503 | Chưa tìm được khoản thu, timeout hoặc rate limit; bật retry, kiểm tra token/UUID và phát lại sau khi API có dữ liệu |
| Có giao dịch nhưng đơn vẫn chờ | Kiểm tra log webhook, tunnel, HTTP response và toàn bộ mã `BL...` |
| Thu thiếu/thừa hoặc chuyển thêm | Cần đối soát; ứng dụng chỉ tự xác nhận một khoản thu khớp toàn bộ số tiền |
| Hoàn tiền `NEEDS_REVIEW` | Trong `backend`, chạy `npm.cmd run refunds -- list`; sửa nguyên nhân rồi retry đúng yêu cầu API v2 cũ |

Tích hợp này chỉ bật Sandbox. Dùng tiền thật cần kiểm tra ngân hàng và quyền
hoàn tiền được SePay hỗ trợ; không chỉ đổi `SEPAY_ENV` sang production.

## Kiểm thử mã nguồn

Từ thư mục `backend`:

```powershell
npm.cmd test -- --configLoader runner
npm.cmd run test:payments
```

`test:payments` tạo schema PostgreSQL riêng, áp dụng migration, dùng SePay mock
và xóa schema sau khi chạy. Không xử lý hàng đợi hoàn hay sửa đơn của ứng dụng.
