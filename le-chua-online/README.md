# 🛕 Lễ Chùa Online — dâng lễ & công đức trên livestream

![Màn hình livestream](screenshot-overlay.png)

## Gồm 3 màn hình

| Trang | Ai dùng | Để làm gì |
|---|---|---|
| `/overlay.html` | Người phát live (đưa vào OBS / TikTok Live Studio) | Cảnh chùa, bàn thờ, nhang khói, QR công đức, bảng vàng, thông báo + tiếng chuông khi có người dâng lễ |
| `/` | Người xem (mở bằng điện thoại) | Chọn lễ (nhang, đèn, hoa, ngũ quả, trọn gói, tùy tâm) → nhận mã QR có sẵn số tiền + mã đơn |
| `/admin.html` | Người quản lý | Xác nhận tiền đã về → lễ hiện lên live; xem/xóa sổ công đức; xuất Excel |

## Chạy thử trên máy (5 phút)

1. Cài **Node.js** (bản LTS) từ https://nodejs.org
2. Mở thư mục `le-chua-online`, sửa file `config.json`:
   - `templeName`, `slogan`, `couplet`: tên chùa, câu đối
   - `bank`: `bankCode` (VD: `MB`, `VCB`, `TCB`, `ACB`...), `accountNo`, `accountName` (viết HOA, không dấu)
   - `adminKey`: **đổi thành mật khẩu riêng của anh**
   - `items`: tên lễ, giá, thời gian hiển thị trên bàn thờ (phút)
3. Mở Terminal/CMD tại thư mục đó, gõ: `node server.js`
4. Mở trình duyệt:
   - http://localhost:3000/admin.html → đăng nhập → bấm **✨ Thử hiệu ứng**
   - http://localhost:3000/overlay.html → sẽ thấy thông báo + chuông + hoa rơi

## Đưa lên livestream

**OBS Studio / TikTok Live Studio:** Thêm nguồn → *Browser* (Trình duyệt) → URL `http://localhost:3000/overlay.html`, rộng 1920, cao 1080.
- Muốn chồng lên camera (thấy được sư thầy/bàn thờ thật phía sau): dùng `overlay.html?transparent=1`
- Bật "Control audio via OBS" để tiếng chuông vào luồng live.

## Hai cách nhận tiền

**Cách 1 — Thủ công (dùng ngay, miễn phí):** Người xem quét QR trên màn hình live, nội dung `CD TÊN`. Người quản lý thấy tiền về trên app ngân hàng → nhập vào `/admin.html` → bấm Xác nhận → lễ hiện lên live.

**Cách 2 — Tự động (cần đưa server lên mạng):** Dùng dịch vụ đọc biến động số dư như **SePay** (sepay.vn).
1. Đưa server lên Internet (VPS, Render, Railway… hoặc tạm thời dùng `cloudflared tunnel`)
2. Trong SePay tạo Webhook: URL `https://ten-mien-cua-anh/api/webhook/sepay`, xác thực **API Key**
3. Điền API Key đó vào `webhookApiKey` trong `config.json`
4. Tiền về → hệ thống tự đọc mã đơn (`CD123456`) hoặc tên (`CD NGUYEN VAN A`) → tự phát lên live, không cần ai bấm.

> Phần webhook đã được thử với dữ liệu mẫu theo định dạng SePay, nhưng **hãy chuyển thử 1 khoản nhỏ** để kiểm tra trước khi dùng thật.

## Cấu trúc mã nguồn (để học)

```
le-chua-online/
├── config.json        ← mọi thiết lập (anh chỉ cần sửa file này)
├── server.js          ← máy chủ Node.js, không cần cài thư viện
├── data.json          ← sổ công đức (tự tạo, đừng xóa / nhớ sao lưu)
└── public/
    ├── common.js      ← hàm dùng chung: QR, tiếng chuông, định dạng tiền
    ├── overlay.html   ← màn hình livestream
    ├── index.html     ← trang người xem
    └── admin.html     ← trang quản trị
```

## Lưu ý quan trọng

- **Minh bạch:** nên dùng tài khoản đứng tên chùa/ban trị sự, công khai sổ công đức (nút xuất Excel).
- **Chính sách nền tảng:** TikTok / YouTube / Facebook có quy định về kêu gọi chuyển tiền ngoài nền tảng — đọc kỹ để tránh bị khóa phiên live.
- **Lời nguyện người xem gửi lên** hiện trực tiếp trên live; người quản lý có thể xóa dòng không phù hợp trong `/admin.html`.
