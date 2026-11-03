# Kiểm soát tồn kho nguyên liệu khi đặt hàng đồng thời

Tồn kho được lưu theo nguyên liệu và đơn vị cơ sở (`g`, `ml`, `unit`), không
đếm số ly đã bán. `ProductRecipeIngredient` định nghĩa lượng nguyên liệu của
từng món theo size; `ToppingRecipeIngredient` định nghĩa lượng nguyên liệu
cho từng topping. Số ly hiển thị trong menu là ước tính dựa trên nguyên liệu
của món theo từng size, chưa tính topping tùy chọn.

Các công thức và tồn đầu kỳ trong seed hiện là số liệu minh họa. Nhóm cần thay
chúng bằng công thức, đơn vị và tồn kho đã thống nhất trước khi dùng số liệu
trong ứng dụng như tồn kho thực tế. Migration không thể suy ra lượng nguyên
liệu từ số lượng ly còn lại ở schema cũ; sau migration, cần nhập tồn nguyên
liệu ban đầu phù hợp.

## Transaction và optimistic locking

Mỗi `Ingredient` có `stockVersion`, khởi tạo bằng `0`. Khi tạo đơn:

1. Đọc sản phẩm, định mức theo size và định mức topping trong transaction
   `ReadCommitted`.
2. Tính lượng tiêu thụ cho từng món, nhân với số lượng; cộng chung mọi lần
   dùng cùng nguyên liệu trong đơn.
3. Xử lý nguyên liệu theo thứ tự ID để các giỏ có thứ tự món khác nhau khóa
   hàng theo cùng thứ tự.
4. Kiểm tra tồn và thực hiện cập nhật có điều kiện:

   ```sql
   UPDATE "Ingredient"
   SET "stock" = "stock" - :required,
       "stockVersion" = "stockVersion" + 1
   WHERE "id" = :ingredientId
     AND "stockVersion" = :versionRead
     AND "stock" >= :required;
   ```

5. Nếu không cập nhật được đúng một hàng, toàn bộ transaction rollback và
   được thử lại. Tối đa 5 lần thực hiện, bao gồm lần đầu.
6. Tạo đơn, chi tiết đơn, snapshot lượng nguyên liệu đã dùng, dùng mã khuyến
   mãi, quy đổi điểm và lưu kết quả idempotency trong cùng transaction. Chỉ
   commit khi tất cả thành công.

Nếu hai khách cùng đọc phiên bản `0`, khách đầu cập nhật thành công sẽ tăng
phiên bản lên `1`. Cập nhật của khách sau với điều kiện phiên bản `0` thất bại,
transaction được rollback rồi đọc lại. Nếu nguyên liệu vẫn đủ, đơn được thử
lại; nếu không, khách nhận lỗi thiếu nguyên liệu.

Mọi luồng nhập/xuất kho sau này cũng cần tăng `stockVersion` cùng lần cập nhật
`stock`. Phiên bản là dữ liệu nội bộ, không gửi từ frontend.

## Phản hồi API

| Trường hợp | Phản hồi `POST /orders` |
|---|---|
| Đặt thành công | `201`, thông tin đơn hàng |
| Thiếu định mức hoặc nguyên liệu không đủ sau khi đọc lại | `400`, thông báo nêu món/topping hoặc nguyên liệu |
| Cả 5 lần đều gặp xung đột phiên bản | `409`, yêu cầu thử lại |

Client giữ giỏ khi thất bại. Nếu đã dùng `Idempotency-Key`, client tiếp tục
dùng cùng khóa và body khi retry. Các khách hàng khác nhau vẫn được kiểm soát
tồn kho ngay cả khi có khóa khác nhau hoặc không gửi khóa.

## Kiểm tra số lượng trên giao diện

Menu báo số lượng ước tính có thể pha theo từng size. Giao diện giới hạn số
lượng theo size đang chọn; backend vẫn kiểm tra định mức và tồn nguyên liệu
trong transaction khi tạo đơn, vì tồn có thể thay đổi sau khi tải thực đơn.

## Unit và integration test

Chạy từ thư mục `backend`, PostgreSQL đang hoạt động, `DATABASE_URL` trỏ đến
cơ sở dữ liệu kiểm thử, migration đã áp dụng và Prisma Client đã generate:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd test -- src/orders/orders.service.spec.ts src/orders/orders-concurrency.service.spec.ts
npm.cmd run test:e2e -- test/orders-concurrency.e2e-spec.ts
```

Unit test kiểm tra nhiều đơn cùng tiêu thụ nguyên liệu, cộng định mức size và
topping, retry khi phiên bản cũ, giới hạn 5 lần và truyền lỗi database không
liên quan.

Integration test dùng hai Nest app với hai connection pool riêng và PostgreSQL
thật. Test đồng bộ thời điểm đọc cùng phiên bản trước khi cho phép cập nhật:

- Nhiều khách đặt đồng thời không tiêu thụ nguyên liệu vượt tồn.
- Đơn không gửi `Idempotency-Key` vẫn không thể oversell nguyên liệu.
- Các định mức theo size và topping được cộng/trừ chính xác.
- Nhiều món dùng chung nguyên liệu chỉ trừ đúng tổng lượng cần thiết.
- Các giỏ có thứ tự nguyên liệu khác nhau không deadlock hoặc trừ một phần.
- Thiếu một nguyên liệu rollback đơn và mọi lần trừ nguyên liệu trước đó.
- Xung đột ở nguyên liệu thứ hai rollback lần trừ đầu trước khi retry.
- Chỉ đơn thành công bị trừ điểm và sử dụng lượt khuyến mãi.

Test chỉ tạo và dọn fixture có ID riêng. Các test idempotency vẫn nằm trong
`idempotency.spec.ts` và `idempotency.e2e-spec.ts`.
