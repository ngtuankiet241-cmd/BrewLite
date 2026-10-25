# Kiểm soát tồn kho khi đặt hàng đồng thời

Tiêu chí nghiệm thu: nhiều khách đặt cùng sản phẩm tại cùng thời điểm nhưng
tổng số lượng bán không vượt tồn kho ban đầu. Tồn kho còn lại không âm và đơn
bị từ chối không để lại cập nhật một phần.

Ứng dụng hiện quản lý tồn ở `Product.stock`. Cơ chế này áp dụng cho sản phẩm;
chưa có bảng nguyên liệu hoặc công thức quy đổi nguyên liệu.

## Transaction và optimistic locking

Mỗi sản phẩm có `stockVersion`, khởi tạo bằng `0`. Khi tạo đơn:

1. Đọc giá, tồn kho và phiên bản trong transaction `ReadCommitted`.
2. Cộng số lượng cùng sản phẩm qua các size/topping; xử lý sản phẩm theo thứ tự
   ID để các giỏ có thứ tự ngược nhau cập nhật hàng theo cùng thứ tự.
3. Kiểm tra tồn kho và thực hiện một cập nhật có điều kiện:

   ```sql
   UPDATE "Product"
   SET "stock" = "stock" - :quantity,
       "stockVersion" = "stockVersion" + 1
   WHERE "id" = :productId
     AND "stockVersion" = :versionRead
     AND "stock" >= :quantity;
   ```

4. Nếu không cập nhật được đúng một hàng, có xung đột phiên bản. Rollback toàn
   bộ transaction, đọc lại và thử lại. Tối đa 5 lần thực hiện, bao gồm lần đầu.
5. Tạo đơn, chi tiết đơn, dùng mã khuyến mãi, quy đổi điểm và lưu kết quả
   idempotency trong cùng transaction. Chỉ commit khi tất cả thành công.

Nếu khách A và B cùng đọc phiên bản `0`, A cập nhật thành công sẽ tăng phiên
bản lên `1`. Cập nhật của B với điều kiện phiên bản `0` thất bại, rollback và
đọc lại. Nếu vẫn đủ hàng, B tiếp tục đặt; nếu không đủ, B nhận lỗi hết hàng.

Mọi luồng nhập/xuất kho bổ sung sau này cũng cần tăng `stockVersion` cùng lần
cập nhật `stock`. Phiên bản là dữ liệu nội bộ, không cần gửi từ frontend.

## Phản hồi API

| Trường hợp | Phản hồi `POST /orders` |
|---|---|
| Đặt thành công | `201`, thông tin đơn hàng |
| Tồn kho không đủ sau khi đọc lại | `400`, `Sản phẩm không đủ tồn kho: ...` |
| Cả 5 lần đều gặp xung đột phiên bản | `409`, yêu cầu thử lại |

Client giữ giỏ khi thất bại. Nếu đã dùng `Idempotency-Key`, client tiếp tục dùng
cùng khóa và body khi retry. Các khách hàng khác nhau vẫn được kiểm soát tồn
kho ngay cả khi có khóa khác nhau hoặc không gửi khóa.

## Unit và integration test

Giao diện kiểm tra số lượng trước khi thêm vào giỏ và khi sửa giỏ, tính chung
các size/topping của cùng sản phẩm. Nếu kho còn 83 nhưng nhập 90, giao diện
giữ số vừa nhập để báo lỗi và khóa nút thêm/đặt hàng, không tự đổi thành 83.
Nút tăng số lượng bị khóa khi đạt mức có thể chọn. Backend vẫn kiểm tra tồn
kho trong transaction khi tạo đơn vì tồn có thể thay đổi sau khi tải thực đơn.

Chạy từ thư mục `backend`, PostgreSQL đang hoạt động và `DATABASE_URL` đã cấu
hình trong `.env`:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd test -- src/orders/orders-concurrency.service.spec.ts
npm.cmd run test:e2e -- test/orders-concurrency.e2e-spec.ts
```

Unit test kiểm tra các đơn cạnh tranh tồn kho, thử lại khi phiên bản cũ,
giới hạn 5 lần và truyền lỗi database không liên quan.

Integration test dùng hai Nest app với hai connection pool riêng và PostgreSQL
thật. Test buộc các yêu cầu đọc cùng phiên bản trước khi cho phép cập nhật để
kiểm chứng được xung đột phiên bản, không phụ thuộc vào tốc độ chạy:

- 12 khách có JWT và khóa idempotency riêng đặt đồng thời với tồn `1`, `5`, `7`;
  chỉ nhận đủ số đơn hợp lệ, tổng số lượng đã bán + tồn còn lại = tồn ban đầu.
- Khách không gửi `Idempotency-Key` vẫn không đặt vượt tồn kho.
- Hai khách đều đặt thành công sau khi retry nếu hàng vẫn đủ.
- Nhiều size/topping của cùng sản phẩm được cộng số lượng chính xác.
- Hai giỏ đảo thứ tự sản phẩm không gây deadlock hoặc trừ kho một phần.
- Thiếu một sản phẩm rollback cả tồn kho lẫn phiên bản của sản phẩm trước đó.
- Xung đột ở sản phẩm thứ hai rollback lần trừ sản phẩm đầu trước khi retry.
- Chỉ khách đặt thành công bị trừ điểm và sử dụng lượt khuyến mãi.

Test chỉ tạo và dọn fixture có ID riêng. Các test idempotency vẫn nằm trong
`idempotency.spec.ts` và `idempotency.e2e-spec.ts`.
