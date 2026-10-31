// =============================================================
//  LỄ CHÙA ONLINE - máy chủ (server)
//  Chạy:  node server.js        (không cần cài thêm thư viện nào)
//
//  Server làm 4 việc:
//   1. Phục vụ các trang web trong thư mục /public
//   2. Lưu danh sách công đức vào file data.json
//   3. Đẩy sự kiện "có người dâng lễ" tới màn hình livestream (SSE)
//   4. (Tùy chọn) Nhận webhook từ ngân hàng/SePay để tự xác nhận tiền
// =============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data.json');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = process.env.PORT || config.port || 3000;

// ---------- Dữ liệu ----------
// donations: các lần dâng lễ đã xác nhận
// orders:    đơn người xem tạo trên web, đang chờ chuyển khoản (key = mã đơn)
let db = { donations: [], orders: {} };
if (fs.existsSync(DATA_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { console.error('data.json lỗi, tạo mới'); }
}
function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

const itemById = (id) => config.items.find((i) => i.id === id);

// Đoán món lễ theo số tiền (dùng khi tiền vào từ ngân hàng mà không có mã đơn)
function itemByAmount(amount) {
  const paid = config.items.filter((i) => i.price > 0 && i.price <= amount).sort((a, b) => b.price - a.price);
  return paid[0] || itemById('congduc');
}

// Làm sạch chữ người dùng nhập: bỏ ký tự điều khiển, giới hạn độ dài
function clean(text, max) {
  return String(text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}

function summary() {
  const total = db.donations.reduce((s, d) => s + d.amount, 0);
  const byName = {};
  for (const d of db.donations) byName[d.name] = (byName[d.name] || 0) + d.amount;
  const top = Object.entries(byName).map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount).slice(0, 5);
  return { total, count: db.donations.length, top };
}

// ---------- SSE: đẩy sự kiện realtime ----------
const clients = new Set();
function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

function addDonation({ name, amount, itemId, wish, source, code }) {
  const item = itemById(itemId) || itemByAmount(amount);
  const donation = {
    id: crypto.randomUUID(),
    time: Date.now(),
    name: clean(name, 40) || 'Phật tử ẩn danh',
    amount: Math.max(0, Math.round(Number(amount) || 0)),
    itemId: item.id,
    wish: clean(wish, 120),
    source: source || 'admin',
    code: code || null,
  };
  db.donations.push(donation);
  if (code && db.orders[code]) db.orders[code].paid = true;
  save();
  broadcast('donation', { donation, summary: summary() });
  console.log(`🙏 ${donation.name} dâng "${item.name}" - ${donation.amount.toLocaleString('vi-VN')}đ`);
  return donation;
}

// ---------- Tiện ích HTTP ----------
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}
function isAdmin(req) {
  const key = req.headers['x-admin-key'] || '';
  const a = Buffer.from(String(key)); const b = Buffer.from(config.adminKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
function serveStatic(req, res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return sendJSON(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// Cấu hình công khai (KHÔNG gửi adminKey / webhookApiKey ra ngoài)
function publicConfig() {
  const { templeName, slogan, couplet, bank, transferPrefix, items } = config;
  return { templeName, slogan, couplet, bank, transferPrefix, items };
}

// ---------- Định tuyến ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/config') return sendJSON(res, 200, publicConfig());

    if (req.method === 'GET' && p === '/api/state') {
      return sendJSON(res, 200, { donations: db.donations.slice(-100), summary: summary() });
    }

    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // Người xem tạo đơn dâng lễ -> nhận mã chuyển khoản
    if (req.method === 'POST' && p === '/api/order') {
      const b = await readBody(req);
      const item = itemById(b.itemId);
      if (!item) return sendJSON(res, 400, { error: 'Món lễ không hợp lệ' });
      const amount = item.price > 0 ? item.price : Math.round(Number(b.amount) || 0);
      if (amount < 1000) return sendJSON(res, 400, { error: 'Số tiền tối thiểu 1.000đ' });
      let code;
      do { code = config.transferPrefix + Math.floor(100000 + Math.random() * 900000); } while (db.orders[code]);
      db.orders[code] = { code, itemId: item.id, amount, name: clean(b.name, 40), wish: clean(b.wish, 120), created: Date.now(), paid: false };
      save();
      return sendJSON(res, 200, db.orders[code]);
    }

    if (req.method === 'GET' && p.startsWith('/api/order/')) {
      const o = db.orders[decodeURIComponent(p.split('/').pop())];
      return o ? sendJSON(res, 200, o) : sendJSON(res, 404, { error: 'Không tìm thấy đơn' });
    }

    // ===== Khu vực quản trị (cần adminKey) =====
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: 'Sai mật khẩu quản trị' });
      const b = req.method === 'POST' ? await readBody(req) : {};

      if (p === '/api/admin/orders') {
        const pending = Object.values(db.orders).filter((o) => !o.paid).sort((a, c) => c.created - a.created).slice(0, 50);
        return sendJSON(res, 200, pending);
      }
      if (p === '/api/admin/confirm') {
        // Xác nhận thủ công: hoặc theo mã đơn, hoặc nhập tay
        if (b.code) {
          const o = db.orders[b.code];
          if (!o) return sendJSON(res, 404, { error: 'Không có mã đơn này' });
          if (o.paid) return sendJSON(res, 400, { error: 'Đơn đã xác nhận rồi' });
          return sendJSON(res, 200, addDonation({ ...o, source: 'admin' }));
        }
        return sendJSON(res, 200, addDonation({ ...b, source: 'admin' }));
      }
      if (p === '/api/admin/all') return sendJSON(res, 200, db.donations);
      if (p === '/api/admin/delete') {
        db.donations = db.donations.filter((d) => d.id !== b.id);
        save();
        broadcast('refresh', { summary: summary() });
        return sendJSON(res, 200, { ok: true });
      }
      if (p === '/api/admin/test') {
        // Hiệu ứng thử: phát lên màn hình nhưng KHÔNG lưu sổ công đức
        const item = itemById(b.itemId) || config.items[0];
        broadcast('donation', { test: true, donation: { id: 'test-' + Date.now(), time: Date.now(), name: 'Thử hiệu ứng', amount: item.price, itemId: item.id, wish: 'Cầu cho mọi người bình an' }, summary: summary() });
        return sendJSON(res, 200, { ok: true });
      }
      return sendJSON(res, 404, { error: 'not found' });
    }

    // ===== Webhook ngân hàng (SePay) - tự động xác nhận khi tiền về =====
    // Cấu hình trên SePay: URL = https://<ten-mien>/api/webhook/sepay ; kiểu xác thực "API Key"
    if (req.method === 'POST' && p === '/api/webhook/sepay') {
      if (!config.webhookApiKey || req.headers['authorization'] !== `Apikey ${config.webhookApiKey}`) {
        return sendJSON(res, 401, { success: false });
      }
      const b = await readBody(req);
      if (b.transferType !== 'in') return sendJSON(res, 200, { success: true });
      const content = String(b.content || '').toUpperCase();
      const amount = Number(b.transferAmount) || 0;
      const prefix = config.transferPrefix.toUpperCase();

      // 1) Có mã đơn (VD: CD123456) -> dùng thông tin đơn
      const m = content.match(new RegExp(prefix + '(\\d{6})'));
      const order = m && db.orders[prefix + m[1]];
      if (order && !order.paid) {
        addDonation({ ...order, amount, source: 'bank' });
      } else {
        // 2) Chuyển khoản trực tiếp từ màn hình live: "CD NGUYEN VAN A"
        const n = content.match(new RegExp('\\b' + prefix + '\\s+([A-Z ]{2,30})'));
        addDonation({ name: n ? n[1].trim() : 'Phật tử ẩn danh', amount, itemId: itemByAmount(amount).id, source: 'bank' });
      }
      return sendJSON(res, 200, { success: true });
    }

    if (req.method === 'GET') return serveStatic(req, res, p);
    sendJSON(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    sendJSON(res, 400, { error: 'Yêu cầu không hợp lệ' });
  }
});

server.listen(PORT, () => {
  console.log(`\n🛕  ${config.templeName} đang chạy:`);
  console.log(`   Trang người xem :  http://localhost:${PORT}/`);
  console.log(`   Màn hình live   :  http://localhost:${PORT}/overlay.html   (thêm vào OBS / TikTok Live Studio)`);
  console.log(`   Trang quản trị  :  http://localhost:${PORT}/admin.html`);
  if (config.adminKey === 'doi-mat-khau-nay') console.log('\n⚠️  Hãy đổi "adminKey" trong config.json trước khi dùng thật!');
});
