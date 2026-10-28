# Bối cảnh, Stakeholder và Phạm vi – BrewLite

## 1. Bối cảnh và vấn đề nghiệp vụ

Nhiều quán nước và cà phê quy mô nhỏ tại Việt Nam vẫn tiếp nhận đơn hàng chủ yếu qua hình thức gọi trực tiếp tại quầy. Quy trình này tồn tại một số vấn đề:

- Khách hàng phải xếp hàng chờ đợi, đặc biệt trong khung giờ cao điểm.
- Nhân viên ghi đơn thủ công dễ nhầm lẫn sản phẩm, tùy chọn (size, topping) hoặc số lượng.
- Thanh toán tiền mặt gây bất tiện: thiếu tiền thối, không kiểm soát doanh thu tức thì.
- Không có hệ thống lưu trữ lịch sử đơn hàng, khó phân tích dữ liệu kinh doanh.
- Khách hàng không biết trạng thái đơn hàng (đang pha chế, sẵn sàng nhận) sau khi đặt.

**BrewLite** giải quyết các vấn đề trên bằng ứng dụng web đặt nước trực tuyến, hỗ trợ thanh toán không tiền mặt. Khách hàng tự xem menu, chọn sản phẩm cùng tùy chọn, đặt đơn và thanh toán qua thiết bị di động. Nhân viên pha chế nhận đơn chính xác từ hệ thống và cập nhật trạng thái để khách hàng theo dõi.

---

## 2. Stakeholder

| Stakeholder | Vai trò | Mục tiêu và kỳ vọng |
|---|---|---|
| **Khách hàng** | Người dùng cuối, đặt và thanh toán đơn hàng | Đặt nước nhanh chóng, chọn size/topping dễ dàng, thanh toán không tiền mặt, theo dõi trạng thái đơn hàng và xem lại lịch sử đơn. |
| **Nhân viên quầy** | Tiếp nhận và pha chế đơn hàng | Nhận đơn hàng chính xác từ hệ thống, cập nhật trạng thái pha chế (đang chuẩn bị, sẵn sàng giao), giảm sai sót do ghi chép thủ công. |
| **Quản lý cửa hàng** | Quản lý vận hành và menu sản phẩm | Quản lý danh mục sản phẩm, theo dõi đơn hàng tổng thể, đảm bảo hệ thống hoạt động ổn định phục vụ kinh doanh. |
| **Giảng viên / Khách hàng nghiệm thu** | Đánh giá sản phẩm theo tiêu chí môn học | Hệ thống đáp ứng đầy đủ yêu cầu đề bài, có tài liệu rõ ràng, mã nguồn có kiểm thử, pipeline CI/CD hoạt động và URL production truy cập được. |
| **Nhóm phát triển** | Thiết kế, hiện thực và triển khai hệ thống | Áp dụng quy trình công nghệ phần mềm, chia task hợp lý, sử dụng Git/GitHub hiệu quả, hoàn thành đúng hạn và học hỏi công nghệ mới. |
| **Đơn vị thanh toán** | Cung cấp dịch vụ thanh toán (SePay sandbox) | API thanh toán hoạt động ổn định, nhận webhook (IPN) chính xác, thông tin giao dịch được ghi nhận đầy đủ. |

---

## 3. Phạm vi

### Phạm vi MVP (In-scope)

1. **Xem menu sản phẩm:** Hiển thị danh sách sản phẩm với tên, hình ảnh, giá bán.
2. **Xem chi tiết và chọn tùy chọn:** Xem thông tin chi tiết sản phẩm, chọn size và topping.
3. **Quản lý giỏ hàng:** Thêm, cập nhật số lượng, xóa sản phẩm trong giỏ hàng.
4. **Xác thực người dùng:** Đăng ký, đăng nhập, đăng xuất với JWT.
5. **Đặt đơn hàng:** Tạo đơn hàng từ giỏ hàng hợp lệ, kiểm tra tồn kho.
6. **Thanh toán mô phỏng:** Lựa chọn phương thức (Ví/Thẻ), xử lý và xác nhận kết quả.
7. **Theo dõi và quản lý đơn:** Xem trạng thái, lịch sử đơn hàng; nhân viên cập nhật trạng thái pha chế.
8. **Triển khai:** Docker, CI/CD qua GitHub Actions, URL production truy cập được qua HTTPS.

### Phạm vi mở rộng (Future scope)

- Hệ thống tích điểm khách hàng thân thiết (loyalty program).
- Mã giảm giá và chương trình khuyến mãi.
- Giao diện quản trị cho quản lý (admin panel): thêm/sửa/ẩn sản phẩm.
- Báo cáo và thống kê doanh thu.
- Thông báo đẩy (push notification) khi đơn hàng thay đổi trạng thái.
- Đánh giá và nhận xét sản phẩm từ khách hàng.

### Ngoài phạm vi (Out-of-scope)

- Giao hàng tận nơi (delivery) — hệ thống chỉ hỗ trợ nhận tại quầy.
- Thanh toán bằng tiền thật — toàn bộ thanh toán là mô phỏng (sandbox).
- Hỗ trợ nhiều chi nhánh cửa hàng (multi-store).
- Ứng dụng native trên iOS/Android — chỉ có PWA trên trình duyệt.
- Tích hợp với hệ thống kế toán hoặc ERP bên ngoài.
- Hỗ trợ đa ngôn ngữ (i18n).

---

## 4. Giả định

1. Cửa hàng hoạt động với một chi nhánh duy nhất.
2. Khách hàng sử dụng thiết bị di động hoặc máy tính có kết nối Internet và trình duyệt hiện đại (Chrome, Safari, Firefox).
3. Thanh toán hoàn toàn là mô phỏng thông qua SePay sandbox; không xử lý tiền thật.
4. Menu sản phẩm được nhập sẵn qua database seed; trong MVP, quản lý không chỉnh sửa menu qua giao diện.
5. PostgreSQL và các dịch vụ hạ tầng (Docker, GitHub Actions) luôn khả dụng trong quá trình phát triển và triển khai.
6. Nhóm phát triển gồm 6 thành viên làm việc bán thời gian (sinh viên).
7. Khách hàng cần đăng nhập trước khi đặt đơn và thanh toán.

---

## 5. Ràng buộc

1. **Công nghệ bắt buộc:** Frontend phải dùng Next.js, backend phải dùng NestJS, dữ liệu lưu trong PostgreSQL. Không được thay thế ba thành phần này.
2. **Thời gian:** Dự án phải hoàn thành theo lịch trình môn Công nghệ Phần mềm, học kỳ I năm học 2026–2027.
3. **Nhân lực:** Nhóm gồm 6 sinh viên, mỗi thành viên dành thời gian có giới hạn ngoài giờ học.
4. **Thanh toán:** Chỉ mô phỏng, tuyệt đối không sử dụng thông tin thanh toán thật hoặc xử lý giao dịch tài chính thực tế.
5. **Quy trình:** Năm task phải được thực hiện tuần tự; task sau chỉ nghiệm thu khi task trước hoàn thành.
6. **Bảo mật:** Không đưa secret (JWT secret, mật khẩu database, khóa thanh toán) lên GitHub hoặc vào log CI/CD.
7. **Triển khai:** Hệ thống phải có URL production truy cập được qua HTTPS tại thời điểm nghiệm thu.

---

## 6. Rủi ro ban đầu

| Mã | Rủi ro | Xác suất | Tác động | Biện pháp giảm thiểu |
|---|---|---|---|---|
| R-01 | Thành viên chưa quen với Next.js hoặc NestJS | Cao | Trung bình | Chia sẻ tài liệu học nội bộ, pair programming, code review hỗ trợ lẫn nhau. |
| R-02 | Xung đột mã nguồn (merge conflict) khi nhiều người cùng sửa | Trung bình | Trung bình | Phân nhánh theo tính năng, mỗi thành viên làm trên branch riêng, review trước khi merge. |
| R-03 | Deadline gấp, khối lượng công việc lớn so với nhân lực | Cao | Cao | Ưu tiên tính năng MVP, cắt giảm tính năng phụ, theo dõi tiến độ hàng tuần qua bảng backlog. |
| R-04 | API sandbox thanh toán (SePay) thay đổi hoặc ngừng hoạt động | Thấp | Cao | Xây dựng mock/stub thanh toán dự phòng để kiểm thử không phụ thuộc dịch vụ bên ngoài. |
| R-05 | Mất dữ liệu database khi triển khai hoặc migration | Thấp | Cao | Sao lưu database trước mỗi lần migration, sử dụng migration có thể rollback. |
| R-06 | Thành viên không hoàn thành task đúng hạn | Trung bình | Cao | Họp tiến độ ngắn hàng tuần, phát hiện sớm điểm nghẽn, sẵn sàng phân công lại kịp thời. |

