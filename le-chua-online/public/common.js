// Các hàm dùng chung cho cả 3 trang (người xem, màn hình live, quản trị)
const LC = {
  config: null,

  async loadConfig() {
    this.config = await (await fetch('/api/config')).json();
    return this.config;
  },

  item(id) { return this.config.items.find((i) => i.id === id) || this.config.items[0]; },

  vnd(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; },

  // Ảnh QR VietQR (miễn phí, mọi app ngân hàng VN đều quét được)
  qrUrl(amount, note) {
    const b = this.config.bank;
    const q = new URLSearchParams({ accountName: b.accountName, addInfo: note || '' });
    if (amount) q.set('amount', amount);
    return `https://img.vietqr.io/image/${b.bankCode}-${b.accountNo}-compact2.png?${q}`;
  },

  // Biểu tượng món lễ: "nhang" vẽ bằng SVG, còn lại dùng emoji
  icon(item, size = 40) {
    if (item.icon === 'nhang') {
      return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
        <g stroke-linecap="round">
          <line x1="14" y1="34" x2="12" y2="8" stroke="#b5532c" stroke-width="2.5"/>
          <line x1="20" y1="34" x2="20" y2="6" stroke="#b5532c" stroke-width="2.5"/>
          <line x1="26" y1="34" x2="28" y2="8" stroke="#b5532c" stroke-width="2.5"/>
          <circle cx="12" cy="8" r="1.8" fill="#ff7a1a"/><circle cx="20" cy="6" r="1.8" fill="#ff7a1a"/><circle cx="28" cy="8" r="1.8" fill="#ff7a1a"/>
        </g>
        <rect x="8" y="30" width="24" height="7" rx="3" fill="#d4a017"/>
      </svg>`;
    }
    return `<span style="font-size:${size * 0.85}px;line-height:1">${item.icon}</span>`;
  },

  // Nhận sự kiện realtime từ server, tự kết nối lại khi rớt mạng
  listen(handlers) {
    const es = new EventSource('/api/events');
    for (const [evt, fn] of Object.entries(handlers)) {
      es.addEventListener(evt, (e) => fn(JSON.parse(e.data)));
    }
    return es;
  },

  // Tiếng chuông chùa tổng hợp bằng Web Audio (không cần file âm thanh)
  bell(volume = 0.5) {
    try {
      const ctx = this._ctx || (this._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const now = ctx.currentTime;
      [[196, 1], [392, 0.5], [588, 0.25], [784, 0.15], [1046, 0.08]].forEach(([f, g]) => {
        const o = ctx.createOscillator(); const gain = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume * g, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
        o.connect(gain).connect(ctx.destination); o.start(now); o.stop(now + 4.6);
      });
    } catch (e) { /* trình duyệt chặn âm thanh - bỏ qua */ }
  },

  // Tạo phần tử HTML an toàn (dùng textContent để chống chèn mã độc từ lời nguyện)
  el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  },
};
