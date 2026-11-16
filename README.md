# Đập Chuột

Mini game phản xạ chạy trên trình duyệt: chuột thò lên ở lưới 3×3, đập trúng được 1 điểm, mỗi lượt 30 giây.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `app/` | Game: `index.html`, `style.css`, `game.js`, `logic.js`, `tests.html` |
| `design/` | Design system (`tokens.css` được game nạp) |
| `docs/` | Tài liệu đặc tả |
| `server/` | Server Node.js nhỏ phục vụ game khi chạy bằng Docker |
| `Dockerfile`, `compose.yaml` | Đóng gói và chạy bằng Docker |

## Cách chơi nhanh (không cần Docker)

Bấm đúp `app/index.html` để mở bằng trình duyệt. Trang test logic: `app/tests.html`.

## Cách chạy bằng Docker

Yêu cầu: đã cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) (có sẵn Docker Compose) và Docker đang chạy.

1. Mở terminal tại thư mục gốc của dự án (nơi có `compose.yaml`).
2. Build image và khởi động:

   ```bash
   docker compose up -d --build
   ```

3. Mở trình duyệt tại **http://localhost:3000**.
   - Trang test logic: http://localhost:3000/tests.html

Các lệnh thường dùng:

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem log | `docker compose logs -f app` |
| Dừng và xoá container | `docker compose down` |
| Build lại sau khi sửa code | `docker compose up -d --build` |

Ghi chú:

- Compose hiện chỉ có 1 dịch vụ `app` (Node.js 22, không dùng thư viện ngoài), chưa có database.
- Server phục vụ `app/` ở đường dẫn `/` và `design/` ở `/design/`, vì `app/style.css` nạp `../design/tokens.css`.
- Code được chép vào image lúc build, nên sửa file xong phải chạy lại `docker compose up -d --build`.
- Nếu cổng 3000 đã bị chiếm, đổi dòng `"3000:3000"` trong `compose.yaml` thành ví dụ `"3001:3000"` rồi mở http://localhost:3001.
- Kiểm tra sức khoẻ: http://localhost:3000/healthz trả về `ok`.

Chạy server không cần Docker (cần Node.js ≥ 18):

```bash
node server/server.js
```
