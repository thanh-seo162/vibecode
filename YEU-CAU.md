# Yêu cầu: Mini game Đập Chuột (trình duyệt)

## 1. Tổng quan

- Mini game một người chơi, chạy trực tiếp trên trình duyệt (máy tính và điện thoại).
- Bàn chơi là lưới **3×3 = 9 ô (hang)**. Chuột lần lượt thò lên ở các ô ngẫu nhiên, người chơi bấm vào chuột để ghi điểm.
- Mỗi lượt chơi kéo dài **30 giây**.
- Không cần đăng nhập, không cần máy chủ: mở file là chơi được.

## 2. Luật chơi

1. Người chơi bấm nút **"Bắt đầu"** để vào lượt chơi. Đồng hồ đếm ngược từ 30 giây bắt đầu chạy ngay.
2. Tại mỗi thời điểm có **tối đa 1 con chuột** trên bàn.
3. Chuột xuất hiện ở **một ô ngẫu nhiên** trong 9 ô, ở lại khoảng **0,8–1,2 giây** rồi tự lặn xuống.
4. Ô xuất hiện kế tiếp **không trùng** với ô vừa xuất hiện, để người chơi không bị "ăn may" khi bấm liên tục một chỗ.
5. Bấm (click/chạm) trúng chuột khi nó đang thò lên → chuột bị đập, lặn xuống ngay, con tiếp theo xuất hiện sau một khoảng nghỉ ngắn (khoảng 0,3–0,5 giây).
6. Mỗi con chuột chỉ được đập **một lần**: bấm thêm vào con đang lặn xuống hoặc vừa bị đập không được tính.
7. Bấm vào ô trống không bị trừ điểm.
8. Khi đồng hồ về **0**, lượt chơi kết thúc ngay: chuột đang thò lên biến mất, mọi cú bấm sau thời điểm này không được tính.
9. Người chơi có thể bấm **"Chơi lại"** để bắt đầu lượt mới; điểm và đồng hồ được đặt lại từ đầu.

## 3. Cách tính điểm

| Hành động | Điểm |
|---|---|
| Bấm trúng chuột đang thò lên | **+1** |
| Bấm trượt (ô trống) | 0 |
| Để chuột tự lặn xuống | 0 |

- Điểm bắt đầu từ **0** ở mỗi lượt.
- Điểm hiện tại cập nhật **ngay lập tức** sau mỗi cú đập trúng.
- **Kỷ lục** (điểm cao nhất) được lưu trong trình duyệt (localStorage), vẫn còn sau khi tải lại trang. Nếu điểm lượt vừa chơi cao hơn kỷ lục thì cập nhật kỷ lục và báo "Kỷ lục mới!".

## 4. Màn hình

### 4.1. Màn hình bắt đầu
- Tên game: **"Đập Chuột"**.
- Mô tả luật ngắn gọn trong 1–2 dòng (ví dụ: "Đập trúng chuột được 1 điểm. Bạn có 30 giây!").
- Hiển thị kỷ lục hiện tại (nếu chưa có thì hiện 0).
- Nút **"Bắt đầu"**.

### 4.2. Màn hình chơi
- **Thanh trên cùng:**
  - Điểm hiện tại, ví dụ `Điểm: 12`.
  - Thời gian còn lại, ví dụ `Thời gian: 18s`, đếm lùi theo từng giây. 5 giây cuối hiển thị màu đỏ để báo sắp hết giờ.
  - Kỷ lục, ví dụ `Kỷ lục: 25`.
- **Bàn chơi:** lưới 3×3 các hang. Chuột có hiệu ứng thò lên và lặn xuống.
- **Phản hồi khi đập trúng:** chuột đổi hình (bị choáng) hoặc nháy, kèm chữ `+1` bay lên ở ô đó.
- Con trỏ chuột trên bàn chơi có thể là hình cái búa (không bắt buộc).

### 4.3. Màn hình kết thúc
- Thông báo **"Hết giờ!"**.
- Điểm của lượt vừa chơi, hiển thị to và rõ.
- Kỷ lục; nếu vừa phá kỷ lục thì hiện thêm dòng "Kỷ lục mới!".
- Nút **"Chơi lại"**.

## 5. Yêu cầu kỹ thuật

- Dùng HTML, CSS và JavaScript thuần, không cần thư viện ngoài và không cần build.
- Chạy được khi mở trực tiếp file `index.html` trên Chrome, Edge, Firefox và Safari bản mới.
- Giao diện responsive: lưới vừa màn hình từ điện thoại (rộng 360px) đến máy tính; mỗi ô đủ lớn để chạm bằng ngón tay (tối thiểu 80×80px).
- Hỗ trợ cả chuột lẫn cảm ứng; trên điện thoại, chạm không bị trễ và không làm phóng to trang.
- Đồng hồ tính theo thời gian thực (dựa trên mốc thời gian, không cộng dồn `setInterval`) để một lượt đúng 30 giây, sai số không quá ±0,2 giây.

## 6. Tiêu chí hoàn thành

Game được xem là hoàn thành khi tất cả các mục sau đều đạt:

- [ ] Mở `index.html` trên trình duyệt là thấy màn hình bắt đầu, không có lỗi trong Console.
- [ ] Bấm "Bắt đầu" thì hiện lưới đúng **3×3 = 9 ô**, đồng hồ bắt đầu từ **30** và đếm lùi về 0.
- [ ] Một lượt kéo dài **30 giây** (±0,2 giây khi đo bằng đồng hồ bấm giờ).
- [ ] Mỗi lúc chỉ có tối đa 1 chuột; vị trí ngẫu nhiên và không lặp lại ô ngay trước đó.
- [ ] Bấm trúng chuột được đúng **+1 điểm**; bấm nhanh nhiều lần vào cùng một con chỉ tính 1 điểm.
- [ ] Bấm ô trống hoặc để chuột lặn đi không thay đổi điểm.
- [ ] Sau khi hết giờ, bấm vào bàn chơi không làm thay đổi điểm.
- [ ] Màn hình kết thúc hiện đúng điểm của lượt vừa chơi.
- [ ] "Chơi lại" đặt điểm về 0 và đồng hồ về 30; không còn chuột hay bộ đếm nào của lượt cũ chạy song song.
- [ ] Kỷ lục được lưu và vẫn đúng sau khi tải lại trang; chỉ cập nhật khi điểm mới cao hơn.
- [ ] Chơi được bằng cảm ứng trên điện thoại, lưới không bị tràn khỏi màn hình rộng 360px.

## 7. Ngoài phạm vi (phiên bản đầu)

- Nhiều mức độ khó, chuột tăng tốc theo thời gian.
- Chuột đặc biệt (chuột vàng, bom trừ điểm...).
- Âm thanh và nhạc nền.
- Bảng xếp hạng online, nhiều người chơi.
