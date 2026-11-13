# Quản lý đơn hàng cho nhân viên

Trang nhân viên dùng giao diện chung của nhóm: `http://localhost:3000/staff`.
Đường dẫn cũ `/admin/orders` chuyển sang `/staff`.

Trang giữ bố cục thẻ đơn, bộ lọc trạng thái và các bước xử lý của frontend trên
`main`. Client đọc đủ các trang của `GET /staff/orders?page=...` để bộ đếm, bộ lọc
và tìm kiếm theo mã/email/điện thoại làm việc trên toàn bộ danh sách. API trả
`totalAmount` và `items[].productName`; client chuyển thành `total` và `items[].name`
cho các thẻ của nhóm. Hủy đơn gửi `POST /staff/orders/:orderCode/cancel` với lý do
bắt buộc; `PATCH .../status` dành cho pha chế/giao khách. Thẻ đơn hiển thị trạng thái
hoàn tiền từ backend và chỉ bật gửi lại khi `refund.canRetry` cho phép.

## Quyền hủy đơn

| Người thao tác | Chưa thanh toán (`PENDING`, `PAYMENT_FAILED`) | Đã thanh toán (`PAID`) | Từ `PREPARING` trở đi |
| --- | --- | --- | --- |
| Khách sở hữu đơn | Được hủy | Liên hệ nhân viên; API trả 403 | Không được hủy |
| Staff / Admin | Được hủy, bắt buộc lý do | Được hủy, bắt buộc lý do | Không được hủy |

Backend kiểm tra trạng thái và khoản thu trong cùng transaction đang khóa đơn.
Nếu webhook thanh toán và hủy đơn xảy ra đồng thời, trạng thái sau khóa quyết định
quyền hủy. Khoản thu đến sau khi hủy vẫn được hoàn theo luồng API v2 hiện có,
không mở lại đơn.

## Cấp quyền staff

1. Đăng ký một tài khoản BrewLite bình thường (điện thoại/mật khẩu).
2. Người vận hành mở terminal tại `backend`, chạy:

```powershell
npm.cmd run staff -- grant email-cua-nhan-vien@example.com
```

Có thể thay email bằng số điện thoại đã đăng ký. Lệnh chỉ cập nhật tài khoản
đã tồn tại; không tạo mật khẩu mặc định và không tự chọn tài khoản để cấp quyền.

Thu hồi quyền:

```powershell
npm.cmd run staff -- revoke email-cua-nhan-vien@example.com
```

Nhân viên đăng nhập tài khoản `STAFF` hoặc `ADMIN` tại trang chủ, rồi mở `/staff`.
Trang bán hàng và trang tài khoản khách không hiển thị liên kết
quản lý đơn hàng.

API kiểm tra role hiện có trong database cho mỗi yêu cầu, không tin role gửi từ
trình duyệt hoặc role trong JWT cũ. Sau khi thu hồi quyền, JWT chưa hết hạn cũng
không truy cập được API staff. Đăng ký công khai luôn tạo `CUSTOMER`; không có
API công khai để tự đổi role.

## Thao tác trên trang quản lý

- Tìm theo mã đơn, email hoặc điện thoại; lọc trạng thái; phân trang 20 đơn.
- Xem món, size/topping, tổng thanh toán, khuyến mãi và điểm.
- **Bắt đầu pha chế** chuyển `PAID → PREPARING`; sau đó không còn quyền hủy.
- **Đã pha chế xong** chuyển `PREPARING → READY`.
- **Đã giao cho khách** chuyển `READY → COMPLETED`.
- **Hủy đơn hàng** mở xác nhận, bắt buộc nhập lý do tối đa 500 ký tự.

Khi staff hủy thành công, backend thực hiện trong cùng transaction:

1. Chuyển đơn sang `CANCELLED`, lưu lý do, thời gian, ID người thao tác và
   `cancellationActor=STAFF`.
2. Hoàn tồn kho, trả lượt sử dụng khuyến mãi.
3. Hoàn điểm đã dùng, thu hồi điểm thưởng (phần thiếu đưa vào nợ điểm như trước).
4. Lưu một yêu cầu hoàn tiền cho khoản đã thu; worker xử lý sau commit.

Gửi lại cùng yêu cầu hủy không hoàn nghiệp vụ lần hai và không ghi đè người/lý do
hủy ban đầu. Hủy tranh chấp với bắt đầu pha chế chỉ cho một thao tác thành công.

## Theo dõi và gửi lại hoàn tiền

Thẻ đơn hiển thị trạng thái hoàn, số tiền, lỗi xử lý và số lần thử. Chỉ trạng thái
`SUCCEEDED` mới được hiển thị đã hoàn. Không có nút tự xác nhận đã trả tiền.

Với yêu cầu API v2 ở `NEEDS_REVIEW`, staff có thể kiểm tra nguyên nhân rồi chọn
**Gửi lại yêu cầu hoàn tiền**. Hệ thống giữ nguyên bản ghi, giao dịch gốc và khóa
chống trùng; chỉ đưa lại vào hàng đợi, ghi nhân viên và thời gian gửi lại.

Không cho gửi lại yêu cầu đang chạy, kết quả thất bại cuối cùng hoặc khoản Gateway
cũ. Các khoản cần đối soát vẫn giữ trạng thái hiện có. Không sửa số tiền hoặc ID
giao dịch qua trang staff.

## API

Tất cả đường dẫn dưới đây yêu cầu Bearer JWT và role `STAFF` hoặc `ADMIN`:

| API | Dữ liệu |
| --- | --- |
| `GET /staff/orders?page=1&status=PAID&search=...` | Danh sách có phân trang, món, khách, thông tin hủy và hoàn tiền |
| `POST /staff/orders/:orderCode/cancel` | `{ "reason": "Khách yêu cầu hủy trước khi pha chế" }` |
| `PATCH /staff/orders/:orderCode/status` | `{ "status": "PREPARING" }`, hoặc `READY`, `COMPLETED` |
| `POST /staff/orders/:orderCode/refunds/:refundId/retry` | Đưa lại đúng yêu cầu `NEEDS_REVIEW` vào hàng đợi |

API trạng thái không nhận `PAID` hoặc `CANCELLED`; ghi nhận thanh toán phải đi
qua webhook đã đối chiếu, còn hủy phải đi qua endpoint có lý do riêng.
Khách vẫn dùng `POST /orders/:orderCode/cancel` cho đơn chưa thanh toán của mình.

## Migration và kiểm thử

Trong `backend`:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd run test:payments
```

Migration mặc định mọi tài khoản hiện có là `CUSTOMER`; không nâng quyền tự động.
Các đơn hủy cũ giữ nhật ký cũ (có thể chưa có thông tin người hủy).
Bộ test dùng schema PostgreSQL riêng và SePay mock, bao gồm phân quyền, thu hồi
quyền, chặn hủy của khách sau trả tiền, hủy đồng thời, tranh chấp pha chế,
rollback và gửi lại hoàn tiền không thay đổi giao dịch gốc.
