# Bối cảnh và phạm vi BrewLite

**Trạng thái:** Bản nháp để nhóm review
**Cơ sở:** Đề bài BrewLite Assignment 1 và Assignment 2
**Mục đích:** Thống nhất vấn đề, người liên quan và ranh giới sản phẩm trước khi hoàn thiện SRS, use-case và các sơ đồ.

## 1. Bối cảnh và vấn đề

BrewLite là ứng dụng đặt đồ uống không dùng tiền mặt cho khách hàng của một cửa
hàng đồ uống. Khách cần xem menu, chọn sản phẩm cùng size/topping, kiểm tra giỏ
hàng và tổng tiền, đặt đơn, thanh toán mô phỏng, rồi xem xác nhận và trạng thái
đơn. Sản phẩm hướng tới giảm thời gian xếp hàng và giúp khách nhận đúng đơn tại
quầy.

Trong phạm vi bài tập, nhóm phát triển một MVP chạy được để minh họa luồng đặt
đồ uống từ lúc chọn món đến lúc thanh toán/xác nhận. Đây là sản phẩm học tập,
không phải hệ thống thanh toán thương mại đang vận hành tại cửa hàng thật.

## 2. Product vision

> BrewLite giúp khách hàng đặt và thanh toán đồ uống không dùng tiền mặt chỉ
> trong vài thao tác, giảm thời gian xếp hàng và nhận đơn nhanh tại quầy.

## 3. Stakeholder

| Stakeholder | Nhu cầu / kỳ vọng | Vai trò trong phạm vi hiện tại |
|---|---|---|
| Khách hàng | Xem đồ uống và giá; chọn size/topping; quản lý giỏ; đặt và thanh toán không tiền mặt; xem xác nhận, trạng thái và lịch sử đơn. | Người dùng chính của MVP. |
| Nhân viên quầy / barista | Nhận biết đơn mới và cập nhật tiến độ pha chế để giao đúng đồ uống. | Đề Assignment 1 nêu đây là phần mở rộng, ngoài phạm vi MVP ban đầu. |
| Quản lý cửa hàng / Product Owner | Xác định ưu tiên, làm rõ quy tắc nghiệp vụ và nghiệm thu chức năng. | Bên đại diện nghiệp vụ trong bối cảnh bài tập; không mặc định có màn hình quản trị trong MVP. |
| Giảng viên / người nghiệm thu | Đánh giá quy trình, tài liệu, khả năng chạy và mức đáp ứng tiêu chí. | Người đánh giá sản phẩm và các tạo phẩm của Assignment 1, Assignment 2. |
| Nhóm phát triển | Phân tích, thiết kế, lập trình, kiểm thử, tích hợp và bàn giao. | Xây dựng và duy trì BrewLite theo backlog của nhóm. |
| Đơn vị / dịch vụ thanh toán | Cung cấp khả năng thanh toán không tiền mặt. | Chỉ mô phỏng bằng dịch vụ thanh toán giả lập trong bài tập; không kết nối giao dịch tiền thật. |

## 4. Phạm vi sản phẩm

### 4.1 Trong phạm vi MVP

Luồng nghiệp vụ cốt lõi:

**Xem menu → xem chi tiết và chọn size/topping → quản lý giỏ hàng → đăng
nhập/đăng ký khi cần → đặt đơn → thanh toán mô phỏng → xem xác nhận và trạng
thái đơn.**

MVP bao gồm:

- Hiển thị menu đồ uống với hình ảnh, tên và giá; có trạng thái tải, danh sách
  rỗng và lỗi.
- Xem chi tiết sản phẩm; chọn kích cỡ và topping; thể hiện giá sau khi chọn.
- Thêm, sửa số lượng và xóa món trong giỏ; tính tổng tiền.
- Đăng ký/đăng nhập bằng tài khoản và xác thực JWT theo yêu cầu bài tập.
- Tạo đơn hàng, kiểm tra dữ liệu đầu vào, ghi nhận trạng thái đơn và cung cấp
  mã đơn.
- Mô phỏng thanh toán bằng Ví/Thẻ; hiển thị kết quả thành công hoặc thất bại.
- Hiển thị xác nhận, trạng thái và lịch sử đơn của khách hàng.
- Lưu dữ liệu ứng dụng trong PostgreSQL; có migration/seed để tái tạo dữ liệu
  trong môi trường phát triển/kiểm thử.
- Hỗ trợ chạy local bằng Docker Compose, kiểm thử các luồng chính, CI/CD và
  triển khai một phiên bản production có thể truy cập theo yêu cầu Assignment 2.

Các gạch đầu dòng trên mô tả ranh giới sản phẩm cấp cao. Chi tiết hành vi và
tiêu chí nghiệm thu sẽ được định danh trong SRS và use-case.

### 4.2 Ngoài phạm vi MVP

- Cổng thanh toán thật, giao dịch tiền thật, lưu thông tin thẻ hoặc tích hợp
  thông tin xác thực của nhà cung cấp thanh toán thật.
- Màn hình dành cho barista để nhận đơn và cập nhật tiến độ pha chế; đề
  Assignment 1 xếp nghiệp vụ này là phần mở rộng ngoài MVP.
- Màn hình quản trị cửa hàng để quản lý menu, người dùng hoặc báo cáo, trừ khi
  nhóm bổ sung và thống nhất yêu cầu riêng.
- Ứng dụng native riêng cho iOS/Android; sản phẩm trong bài là ứng dụng web
  mobile-first/PWA.
- Mở rộng thành nền tảng nhiều cửa hàng, giao hàng, tích hợp logistics hoặc
  vận hành thương mại thực tế.
- Khuyến mãi, điểm thưởng và các nghiệp vụ nâng cao không thuộc luồng MVP cốt
  lõi; chỉ đưa vào phần mở rộng/backlog riêng nếu được nhóm xác nhận.

## 5. Giả định

- BrewLite mô phỏng hoạt động của một cửa hàng đồ uống; nhóm chưa xác định yêu
  cầu cho nhiều chi nhánh.
- Khách hàng dùng trình duyệt web trên điện thoại hoặc máy tính; ưu tiên thiết
  kế mobile-first.
- Đơn hàng được nhận tại quầy; giao hàng không nằm trong luồng MVP đã nêu.
- Khách có thể xem menu trước khi đăng nhập; cần đăng nhập khi đặt đơn theo
  luồng nghiệp vụ của đề Assignment 1.
- Giá, size, topping và trạng thái đơn dùng dữ liệu do hệ thống cung cấp; khách
  không tự gửi giá để quyết định tổng tiền cuối cùng.
- Dịch vụ thanh toán là mô phỏng và không thu tiền thật.
- Tạo phẩm và tính năng sẽ được hoàn thiện dần theo backlog; các chức năng
  nâng cao không được hiểu là cam kết có trong MVP nếu chưa có tiêu chí riêng.

## 6. Ràng buộc

- Frontend phải dùng Next.js; backend phải dùng NestJS.
- Dữ liệu bền vững phải dùng PostgreSQL; Assignment 2 yêu cầu migration/seed
  có thể tái tạo cơ sở dữ liệu.
- Môi trường local phải có Docker Compose chạy frontend, backend và database
  theo yêu cầu Assignment 2.
- Dịch vụ thanh toán phải là mock; không đưa secret, mật khẩu hoặc thông tin
  thanh toán thật vào repository hay log.
- Tài liệu, sơ đồ và mã nguồn phải được quản lý bằng Git, có lịch sử thay đổi
  rõ ràng trong repository nhóm.
- Phạm vi và tiêu chí nghiệm thu phải đáp ứng các yêu cầu chính thức của cả
  Assignment 1 và Assignment 2; tài liệu Task sau phải nhất quán với Task trước.
- Deployment diagram và hướng dẫn triển khai phải phản ánh môi trường thực tế
  nhóm chọn; nền tảng production cụ thể chưa được xác nhận trong bản nháp này.

## 7. Rủi ro ban đầu

| Rủi ro | Ảnh hưởng có thể xảy ra | Hướng giảm thiểu |
|---|---|---|
| Nhóm hiểu khác nhau về nội dung MVP giữa hai Assignment. | Thiếu tính năng bắt buộc hoặc đưa quá nhiều việc ngoài phạm vi vào Sprint. | Dùng tài liệu này làm ranh giới chung; đối chiếu từng yêu cầu với đề và ghi thay đổi qua review. |
| Yêu cầu, use-case, sơ đồ và code không khớp nhau. | Khó kiểm thử, tích hợp và chứng minh truy vết. | Dùng mã yêu cầu thống nhất; review sự nhất quán trước khi chốt từng Task. |
| Tích hợp frontend, API, xác thực và database trễ hoặc hợp đồng dữ liệu đổi. | Các thành viên phải sửa lại phần đã làm; trễ luồng end-to-end. | Chốt payload/response và quy tắc nghiệp vụ trước khi ghép; tích hợp từng phần sớm trên branch/PR. |
| Phụ thuộc dịch vụ bên ngoài hoặc ảnh từ URL không ổn định. | Demo có thể thiếu ảnh hoặc không truy cập được dịch vụ thanh toán thật. | Dùng mock payment; chuẩn bị dữ liệu demo và phương án ảnh thay thế phù hợp. |
| Database migration/seed không tái tạo được ở máy khác. | Người chấm không chạy được hệ thống từ repository. | Kiểm thử hướng dẫn từ môi trường sạch bằng Docker Compose và ghi rõ lệnh trong README. |
| CI/CD, secrets hoặc deployment production chưa được kiểm chứng. | Không có URL hoạt động hoặc vô tình lộ thông tin nhạy cảm. | Dùng secrets của nền tảng CI/CD, không commit credentials; chạy health check và smoke test trước bàn giao. |
| Chức năng barista/admin bị hiểu nhầm là bắt buộc cho MVP. | Phạm vi phình to, ảnh hưởng hoàn thành luồng khách hàng chính. | Giữ chức năng đó ngoài MVP trừ khi đề hoặc nhóm chính thức thay đổi phạm vi. |

## 8. Điểm cần nhóm review

- Xác nhận mô hình một cửa hàng và nhận đơn tại quầy có đúng phạm vi nhóm
  thống nhất không.
- Xác nhận đăng nhập có bắt buộc trước khi gửi đơn hay chỉ trước khi xem lịch
  sử/đặt một số loại đơn.
- Xác nhận có đưa khuyến mãi/điểm thưởng vào MVP hay để phần mở rộng.
- Chọn nền tảng production để deployment diagram và README phản ánh đúng môi
  trường sẽ dùng.