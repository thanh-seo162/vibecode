# Đập Chuột

Mini game phản xạ chạy trên trình duyệt: chuột thò lên ở lưới 3×3, đập trúng được 1 điểm, mỗi lượt 30 giây. Người chơi đăng ký (họ tên, email, số điện thoại) trước khi chơi; quản trị viên xem danh sách ở `/admin`.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `app/` | Game: `index.html`, `style.css`, `game.js`, `logic.js`, `validate.js` (kiểm tra dữ liệu, dùng chung với server), `tests.html` |
| `app/admin/` | Trang quản trị `/admin` |
| `design/` | Design system (`tokens.css` được game nạp) |
| `docs/` | Tài liệu đặc tả |
| `server/` | Server Node.js: phục vụ game, API đăng ký/gửi điểm/quản trị, kết nối PostgreSQL |
| `Dockerfile`, `compose.yaml` | Đóng gói và chạy bằng Docker (app + PostgreSQL) |
| `.env.example` | Mẫu file `.env` chứa mật khẩu database và quản trị |

## Cách chạy bằng Docker

Yêu cầu: đã cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) (có sẵn Docker Compose) và Docker đang chạy.

1. Mở terminal tại thư mục gốc của dự án (nơi có `compose.yaml`).
2. Tạo file `.env` từ file mẫu, rồi đặt `POSTGRES_PASSWORD` và `ADMIN_PASSWORD` (tối thiểu 12 ký tự):

   ```bash
   cp .env.example .env
   ```

3. Build image và khởi động:

   ```bash
   docker compose up -d --build
   ```

4. Mở trình duyệt:
   - Game: **http://localhost:3000**
   - Quản trị: **http://localhost:3000/admin** (đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`)
   - Trang test logic: http://localhost:3000/tests.html

Các lệnh thường dùng:

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem log | `docker compose logs -f app` |
| Dừng và xoá container (giữ dữ liệu) | `docker compose down` |
| Xoá cả dữ liệu database | `docker compose down -v` |
| Build lại sau khi sửa code | `docker compose up -d --build` |

Ghi chú:

- Compose có 2 dịch vụ: `db` (PostgreSQL 17, dữ liệu trong volume `dap-chuot-pgdata`) và `app` (Node.js 22). App chỉ khởi động khi database đã sẵn sàng.
- File `.env` chứa mật khẩu nên không được commit (đã có trong `.gitignore`).
- Thiếu `ADMIN_PASSWORD` (hoặc ngắn hơn 12 ký tự) thì game vẫn chạy nhưng trang `/admin` bị tắt.
- Code được chép vào image lúc build, nên sửa file xong phải chạy lại `docker compose up -d --build`.
- Nếu cổng 3000 đã bị chiếm, đổi dòng `"3000:3000"` trong `compose.yaml` thành ví dụ `"3001:3000"` rồi mở http://localhost:3001.
- Kiểm tra sức khoẻ: http://localhost:3000/healthz trả về `ok` khi kết nối được database.
- Game cần server để đăng ký và gửi điểm, nên không mở được bằng cách bấm đúp `app/index.html` nữa.
