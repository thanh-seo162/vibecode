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

5. Lấy địa chỉ công khai (Cloudflare Tunnel) để gửi cho người khác chơi:

   ```bash
   docker compose logs tunnel | grep trycloudflare.com
   ```

   Địa chỉ có dạng `https://xxxx.trycloudflare.com` (thêm `/admin` cho trang quản trị).

6. Chạy với tên miền riêng **https://elvion.io.vn** (Cloudflare Tunnel có tên `elvion`):

   ```bash
   docker compose -f compose.yaml -f compose.prod.yaml up -d
   ```

   Cần thư mục `cloudflared/` (chứa `config.yml`, `cert.pem` và file khoá `<tunnel-id>.json`; bí mật, đã có trong `.gitignore`). Mất thư mục này thì tạo lại bằng `cloudflared tunnel login`, `tunnel create`, `tunnel route dns`.

Các lệnh thường dùng:

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem log | `docker compose logs -f app` |
| Dừng và xoá container (giữ dữ liệu) | `docker compose down` |
| Xoá cả dữ liệu database | `docker compose down -v` |
| Build lại sau khi sửa code | `docker compose up -d --build` |

Ghi chú:

- Compose có 3 dịch vụ: `db` (PostgreSQL 17, dữ liệu trong volume `dap-chuot-pgdata`), `app` (Node.js 22) và `tunnel` (Cloudflare Tunnel). App chỉ khởi động khi database đã sẵn sàng.
- Cloudflare Tunnel dùng chế độ nhanh: miễn phí, không cần tài khoản Cloudflare, nhưng địa chỉ đổi mỗi lần container `tunnel` khởi động lại (kể cả khi khởi động lại máy) và chỉ truy cập được khi máy này đang bật và Docker đang chạy. Cổng 3000 chỉ mở cho chính máy này (`127.0.0.1`), người khác vào qua địa chỉ tunnel.
- `.env` đặt `COOKIE_SECURE=1` và `TRUST_PROXY=1` vì tunnel phục vụ qua HTTPS và chuyển tiếp IP người chơi.
- File `.env` chứa mật khẩu nên không được commit (đã có trong `.gitignore`).
- Thiếu `ADMIN_PASSWORD` (hoặc ngắn hơn 12 ký tự) thì game vẫn chạy nhưng trang `/admin` bị tắt.
- Code được chép vào image lúc build, nên sửa file xong phải chạy lại `docker compose up -d --build`.
- Nếu cổng 3000 đã bị chiếm, đổi dòng `"127.0.0.1:3000:3000"` trong `compose.yaml` thành ví dụ `"127.0.0.1:3001:3000"` rồi mở http://localhost:3001.
- Kiểm tra sức khoẻ: http://localhost:3000/healthz trả về `ok` khi kết nối được database.
- Game cần server để đăng ký và gửi điểm, nên không mở được bằng cách bấm đúp `app/index.html` nữa.
