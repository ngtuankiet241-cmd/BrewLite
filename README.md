# BrewLite

BrewLite is a cashless drink-ordering application built for the Software
Engineering course project. The MVP is being developed in small increments:
browsing drinks, choosing options, managing a cart, placing an order, simulating
payment, and viewing confirmation.

## Project structure

- `frontend/` - Next.js and TypeScript web application
- `backend/` - NestJS and TypeScript REST API
- `docs/api-contracts.md` - confirmed API details and decisions still needed
- `BrewLite-Tien-do.xlsx` - team backlog and progress tracker

## Requirements

- Node.js LTS and npm
- PostgreSQL, with a database configured in `backend/.env`
- Git
- Windows PowerShell users may need `npm.cmd` instead of `npm`

Install dependencies once from the repository root:

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Configure `DATABASE_URL` in `backend/.env`, then apply migrations and generate
the Prisma client from the backend directory:

```powershell
cd backend
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npx.cmd prisma db seed
cd ..
```

## Run locally

Run the backend and frontend in separate PowerShell terminals from the
repository root.

Terminal 1 - backend:

```powershell
npm.cmd --prefix backend run start:dev
```

The API listens at `http://localhost:3001`.

Terminal 2 - frontend:

```powershell
npm.cmd --prefix frontend run dev
```

Open `http://localhost:3000` in a browser. The menu requests products from
`GET http://localhost:3001/products`; keep the backend running while using the
frontend.

## Current API

`GET /products` returns products from the database. A product currently contains:
`id`, `name`, `price` (integer VND), `imageUrl`, and `stock` (inventory quantity).
It does not yet return category or description. See [the API contract and open decisions](docs/api-contracts.md).

The backend enables CORS for local frontend requests. `POST /orders` creates a
validated `PENDING` order in PostgreSQL, including item and price snapshots.
The order, its items, stock deductions and any promotion usage are saved in one
transaction, and orders survive backend restarts. Insufficient stock rejects the
order; successful checkout reloads the menu inventory. The repository also
contains authentication, payment simulation, and order-history features; these
still need to be verified together in an end-to-end run before they are treated
as accepted. Payments in this project are simulated and must not use real
payment credentials.

## Checks

Run from the repository root:

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

The backend e2e suite requires the configured PostgreSQL database with migrations
applied and menu data seeded. It covers the product list, order creation,
persistence after closing the app, stock deduction, insufficient stock, transaction
rollback and concurrent promotion checkout. The persistence tests create unique
fixtures and remove them after testing. See
[the API contract](docs/api-contracts.md) for the order payload and validation
rules.

GitHub Actions runs backend build, lint, unit tests, and e2e tests against a
temporary PostgreSQL service, plus frontend lint and production build, for pull
requests and pushes to `main`.

## Environment variables

Set `DATABASE_URL` in `backend/.env` for PostgreSQL and `JWT_SECRET` for login.
`.env.example` contains configuration placeholders. Never commit `.env` files,
passwords, JWT secrets, or payment credentials.

## Team workflow

1. Agree on a task and its acceptance criteria.
2. Coordinate API request/response fields using [the API contract](docs/api-contracts.md).
3. Create a branch for the task; do not commit directly to `main`.
4. Make and test a focused change, then open a pull request for review.
5. Update the progress workbook after the work is verified.

## Kiệt's coordination checklist

- Keep these setup and validation instructions aligned with the repository.
- Track task owners, pull requests, blockers, and test evidence in the progress
  workbook; a merged pull request alone does not mean a task passed acceptance.
- Before a demo, confirm PostgreSQL, migrations, and seed data are ready, then
  run the backend and frontend together through the main customer flow.
- Record remaining issues and who will follow up; do not include local secrets
  or `.env` files in commits.


---

## HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY BREWLITE

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

Đồng thời cấu hình thông tin SePay riêng:
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
Mở CMD mới.  
Nhập:
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
3. Thiết lập:

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
Khi đã cài đặt thành công, chỉ cần:
1. Mở Docker Desktop.
2. Chạy PostgreSQL bằng: `docker start brewLite-db`
3. Chạy Backend bằng: `npm run start:dev`
4. Chạy Frontend bằng: `npm run dev`
5. Chạy ngrok bằng Docker với domain riêng.
6. Kiểm tra IPN trên SePay.
7. Mở BrewLite và kiểm thử thanh toán.

**Tóm tắt quy trình:**  
Cài thư viện → Docker/PostgreSQL → .env → Prisma → Backend/Frontend → ngrok → SePay IPN → Kiểm thử thanh toán.
