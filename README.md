# BrewLite

BrewLite là ứng dụng đặt đồ uống trực tuyến không dùng tiền mặt (cashless drink-ordering), được xây dựng phục vụ đồ án môn Công nghệ Phần mềm. Phiên bản MVP được phát triển theo từng bước: xem thực đơn, chọn tùy chọn (size/topping), quản lý giỏ hàng, tạo đơn hàng, mô phỏng thanh toán và xem trang xác nhận đơn.

## Cấu trúc dự án

- `frontend/` - Ứng dụng web xây dựng bằng Next.js và TypeScript
- `backend/` - REST API xây dựng bằng NestJS và TypeScript
- `docs/api-contracts.md` - Chi tiết hợp đồng API đã thống nhất và các quyết định kỹ thuật
- `BrewLite-Tien-do.xlsx` - Bảng theo dõi tiến độ và backlog của nhóm
- `docker-compose.yml` - Cấu hình chạy toàn bộ hệ thống bằng Docker Compose

## Yêu cầu môi trường

- Node.js LTS và npm
- PostgreSQL, cấu hình kết nối CSDL trong file `backend/.env`
- Git
- Người dùng Windows PowerShell có thể dùng `npm.cmd` thay cho `npm`

Cài đặt các gói thư viện phụ thuộc một lần từ thư mục gốc của dự án:

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Cấu hình `DATABASE_URL` trong file `backend/.env`, sau đó chạy migration và sinh Prisma client từ thư mục `backend`:

```powershell
cd backend
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npx.cmd prisma db seed
cd ..
```

## Khởi chạy cục bộ (Local)

Chạy backend và frontend trong hai cửa sổ terminal PowerShell riêng biệt từ thư mục gốc của dự án.

Terminal 1 - Backend:

```powershell
npm.cmd --prefix backend run start:dev
```

API sẽ lắng nghe tại: `http://localhost:3001`.

Terminal 2 - Frontend:

```powershell
npm.cmd --prefix frontend run dev
```

Mở trình duyệt và truy cập: `http://localhost:3000`. Trang thực đơn sẽ gửi yêu cầu lấy danh sách thức uống từ `GET http://localhost:3001/products`; vui lòng giữ backend luôn hoạt động trong quá trình sử dụng frontend.

### Khởi chạy bằng Docker Compose (Khuyên dùng cho Demo)

Nếu máy đã cài đặt Docker Desktop, bạn có thể chạy toàn bộ hệ thống (PostgreSQL, Backend, Frontend) chỉ với một lệnh:

```powershell
docker compose up --build
```

Sau khi hoàn tất, mở trình duyệt vào `http://localhost:3000` để sử dụng.

## Hiện trạng API

`GET /products` trả về danh sách thức uống từ CSDL. Mỗi sản phẩm hiện bao gồm:
`id`, `name`, `price` (số nguyên VND), `imageUrl`, và `stock` (số lượng tồn kho trong CSDL).
API hiện tại chưa trả về trường category và description (frontend tạm phân loại dựa trên tên). Chi tiết xem tại [Hợp đồng API và các quyết định mở](docs/api-contracts.md).

Backend đã cấu hình CORS cho phép các yêu cầu từ frontend cục bộ. `POST /orders` tạo một đơn hàng hợp lệ ở trạng thái `PENDING` trong PostgreSQL, bao gồm bản lưu thông tin (snapshot) sản phẩm, size, topping và giá tại thời điểm đặt. Đơn hàng, chi tiết đơn, khấu trừ tồn kho và việc sử dụng mã khuyến mãi được thực hiện đồng thời trong một transaction; dữ liệu đơn hàng vẫn được lưu trữ bền vững sau khi khởi động lại backend. Nếu tồn kho không đủ, đơn hàng sẽ bị từ chối; sau khi thanh toán thành công, thực đơn sẽ cập nhật lại số lượng tồn kho mới. Dự án cũng tích hợp đầy đủ tính năng xác thực tài khoản JWT, thanh toán mô phỏng SePay Sandbox và xem lịch sử đơn hàng. Thanh toán trong dự án hoàn toàn là mô phỏng và tuyệt đối không sử dụng thông tin thanh toán thật.

## Kiểm tra và kiểm thử (Checks)

Chạy từ thư mục gốc của dự án:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix backend test
npm.cmd --prefix backend run test:e2e
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build

# (a) Chặn chuyển trạng thái sai — unit test
npm.cmd --prefix backend test -- src/orders/order-state-machine.spec.ts src/orders/orders-status.service.spec.ts

# (a) Integration liên quan đến trạng thái
npm.cmd --prefix backend run test:e2e -- test/loyalty.e2e-spec.ts

# (b) Gửi 2 lần cùng Idempotency-Key chỉ tạo 1 đơn — unit test
npm.cmd --prefix backend test -- src/prisma/idempotency.spec.ts

# (b) Integration test
npm.cmd --prefix backend run test:e2e -- test/idempotency.e2e-spec.ts

# (c) Đặt đồng thời không vượt tồn kho — unit test
npm.cmd --prefix backend test -- src/orders/orders-concurrency.service.spec.ts

# (c) Integration test
npm.cmd --prefix backend run test:e2e -- test/orders-concurrency.e2e-spec.ts
```

Hoặc khi chạy trực tiếp trong thư mục `backend`:

```powershell
# (a) Chặn chuyển trạng thái sai — unit test
npm.cmd test -- src/orders/order-state-machine.spec.ts src/orders/orders-status.service.spec.ts

# (a) Integration liên quan đến trạng thái
npm.cmd run test:e2e -- test/loyalty.e2e-spec.ts

# (b) Gửi 2 lần cùng Idempotency-Key chỉ tạo 1 đơn — unit test
npm.cmd test -- src/prisma/idempotency.spec.ts

# (b) Integration test
npm.cmd run test:e2e -- test/idempotency.e2e-spec.ts

# (c) Đặt đồng thời không vượt tồn kho — unit test
npm.cmd test -- src/orders/orders-concurrency.service.spec.ts

# (c) Integration test
npm.cmd run test:e2e -- test/orders-concurrency.e2e-spec.ts
```

Bộ e2e test của backend yêu cầu CSDL PostgreSQL đang hoạt động, đã được áp dụng migration và nạp dữ liệu mẫu. Bộ kiểm thử bao phủ: danh sách món, tạo đơn, lưu trữ bền vững khi khởi động lại ứng dụng, khấu trừ tồn kho, xử lý khi không đủ hàng, rollback transaction, kiểm tra trùng lặp với Idempotency-Key, webhook thanh toán lặp lại, kiểm soát tồn kho đồng thời với optimistic locking và sử dụng mã khuyến mãi đồng thời.

GitHub Actions tự động chạy quy trình CI: build, lint, unit tests, và e2e tests của backend trên một PostgreSQL service tạm thời, kết hợp với lint và build production của frontend cho mỗi pull request và push vào nhánh `main`.

## Biến môi trường

Cấu hình `DATABASE_URL` trong file `backend/.env` cho PostgreSQL và `JWT_SECRET` cho xác thực đăng nhập.
File `.env.example` chứa các biến mẫu. **Tuyệt đối không đưa file `.env`, mật khẩu cá nhân, khóa bí mật JWT hay thông tin thanh toán lên Git.**

## Quy trình làm việc nhóm

1. Thống nhất về task và tiêu chí hoàn thành (acceptance criteria).
2. Phối hợp các trường request/response theo tài liệu [Hợp đồng API](docs/api-contracts.md).
3. Tạo nhánh riêng (branch) cho từng task; không commit trực tiếp vào nhánh `main`.
4. Thực hiện thay đổi tập trung, kiểm thử cẩn thận, sau đó mở pull request để các thành viên review.
5. Cập nhật bảng theo dõi tiến độ [BrewLite-Tien-do.xlsx](BrewLite-Tien-do.xlsx) sau khi công việc đã được nghiệm thu.

## Checklist điều phối của Kiệt (Nhóm trưởng)

- Giữ các hướng dẫn cài đặt và kiểm thử luôn đồng bộ với trạng thái thực tế của repository.
- Theo dõi người phụ trách task, pull request, vướng mắc và bằng chứng kiểm thử trong bảng tiến độ; một pull request được merge chưa đồng nghĩa với việc task đã qua nghiệm thu.
- Trước buổi demo, xác nhận PostgreSQL, migrations và dữ liệu mẫu đã sẵn sàng; sau đó chạy backend và frontend cùng nhau qua toàn bộ luồng khách hàng chính.
- Ghi nhận các vấn đề còn tồn đọng và phân công người tiếp tục xử lý; không đưa bí mật cục bộ hoặc file `.env` vào commit.

---

## HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY BREWLITE (Tích hợp SePay Sandbox & ngrok)

Áp dụng cho các thành viên đã có source code trên máy.

### Bước 1: Chuẩn bị phần mềm
Cần cài đặt:
- Node.js và npm.
- VS Code.
- Docker Desktop.
- Tài khoản ngrok riêng.
- Tài khoản SePay riêng.

### Bước 4: Cấu hình file .env
Trong thư mục `backend`, tạo hoặc chỉnh sửa file `.env`.

Ví dụ cấu hình PostgreSQL:
```env
DATABASE_URL="postgresql://postgres:YOUR_DB_PASSWORD@localhost:5432/brewLite?schema=public"
```

Đồng thời cấu hình thông tin SePay riêng (dùng môi trường Sandbox test):
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/brewLite?schema=public"
JWT_SECRET="dev-secret-change-this-to-a-long-random-value"
PORT=3001
SEPAY_ENV=sandbox
SEPAY_MERCHANT_ID=SP-TEST-MTB98393
SEPAY_SECRET_KEY=spsk_test_nWM9MkoEfRuXnMx3kLLsGMvzRve2ZGH9
SEPAY_IPN_SECRET_KEY=Hung2304
FRONTEND_URL=http://localhost:3000
```
- Secret Key xác thực IPN.
- Số tài khoản ngân hàng nhận tiền.
- Mã ngân hàng.
- Các thông số thanh toán khác mà Backend yêu cầu.

*Lưu ý:*
- Tên các biến SePay phải khớp với source code BrewLite. Nếu có `.env.example`, hãy sử dụng làm mẫu.
- Không đưa file `.env`, Secret Key hoặc mật khẩu lên GitHub.

### Bước 5: Khởi tạo Prisma
Mở Terminal trong thư mục `backend`:
```powershell
npx prisma generate
npx prisma migrate deploy
```
Đảm bảo PostgreSQL đã chạy và kết nối thành công.

### Bước 6: Chạy Backend và Frontend
Terminal 1 — Backend:
```powershell
cd backend
npm run start:dev
```
Backend dự kiến chạy ở cổng `3001`.

Terminal 2 — Frontend:
```powershell
cd frontend
npm run dev
```
Mở đường dẫn được Frontend hiển thị, thường là:
`http://localhost:3000` (hoặc `http://localhost:5173`)

*Lưu ý:* Các lệnh `cd backend` và `cd frontend` ở trên áp dụng khi Terminal bắt đầu tại thư mục gốc BrewLite. Nếu đã ở đúng thư mục thì không cần cd lại.

### Bước 7: Đăng ký và lấy domain ngrok
1. Truy cập: [https://dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup) và đăng ký tài khoản ngrok riêng.
2. Vào: [https://dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains) lấy domain của tài khoản, ví dụ: `panda-sketch-stitch.ngrok-free.dev`.
3. Tiếp tục vào: [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) lấy Authtoken riêng.

### Bước 8: Chạy ngrok bằng Docker
Mở CMD mới và nhập:
```cmd
set /p NGROK_AUTHTOKEN=Nhap ngrok authtoken:
```
Dán token và nhấn Enter. (CMD sẽ hiển thị token khi nhập nên không chia sẻ ảnh màn hình có token).

Tiếp tục chạy:
```cmd
docker run --rm -it --name brewlite-ngrok -e NGROK_AUTHTOKEN ngrok/ngrok:latest http --url=DOMAIN_CUA_BAN host.docker.internal:3001
```
Chỉ thay `DOMAIN_CUA_BAN` bằng domain ngrok thực tế.  
Ví dụ:
```cmd
docker run --rm -it --name brewlite-ngrok -e NGROK_AUTHTOKEN ngrok/ngrok:latest http --url=panda-sketch-stitch.ngrok-free.dev host.docker.internal:3001
```
Nếu thành công, ngrok sẽ hiển thị URL HTTPS. Giữ CMD chạy ngrok hoạt động trong suốt quá trình kiểm thử.

### Bước 9: Cấu hình SePay riêng
1. Truy cập [https://my.sepay.vn](https://my.sepay.vn), đăng ký hoặc đăng nhập tài khoản SePay riêng và hoàn tất cấu hình nguồn giao dịch/ngân hàng theo yêu cầu của SePay.
2. Mở phần cấu hình IPN: [https://my.sepay.vn/pg/merchant/ipn](https://my.sepay.vn/pg/merchant/ipn)
3. Thiết lập các giá trị:

| Mục | Giá trị |
|---|---|
| IPN URL | Domain ngrok riêng + `/payments/ipn` (Ví dụ: `https://panda-sketch-stitch.ngrok-free.dev/payments/ipn`) |
| Auth Type | Secret Key |
| Secret Key | Khớp với cấu hình Backend (`SEPAY_IPN_SECRET_KEY`) |
| Content Type | `application/json` |
| Kích hoạt IPN | Bật |

Nhấn **Cập nhật** để lưu.

*Lưu ý:* Thông tin tài khoản nhận tiền trong QR và cấu hình SePay phải phù hợp với nhau. Chỉ đổi IPN và Secret Key chưa chắc đã đủ nếu Backend đang sử dụng thông tin ngân hàng cố định trong code.

### Bước 10: Những lần chạy sau
Khi đã cài đặt thành công, các lần chạy sau chỉ cần:
1. Mở Docker Desktop.
2. Chạy PostgreSQL bằng: `docker start brewLite-db` (hoặc service PostgreSQL của Windows).
3. Chạy Backend bằng: `npm run start:dev` (trong thư mục `backend`).
4. Chạy Frontend bằng: `npm run dev` (trong thư mục `frontend`).
5. Chạy ngrok bằng Docker với domain riêng.
6. Kiểm tra IPN trên SePay.
7. Mở BrewLite và kiểm thử thanh toán.

**Tóm tắt quy trình:**  
Cài thư viện → Docker/PostgreSQL → .env → Prisma → Backend/Frontend → ngrok → SePay IPN → Kiểm thử thanh toán.
