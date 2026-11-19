(function () {

  try {
    var nosw = typeof location !== 'undefined' && /(?:^|[?&])nosw=1(?:&|$)/.test(location.search);
    var insecure = typeof window !== 'undefined' && window.isSecureContext === false;
    var host = (typeof location !== 'undefined' && location.hostname) || '';
    var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    var ok = !nosw && !insecure && (local || (typeof location !== 'undefined' && location.protocol === 'https:'));
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      if (ok) navigator.serviceWorker.register('./sw.js?v=53.16').catch(function () {});
      else navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
    }
  } catch (e) {}
  const params = new URLSearchParams(location.search);
  /* v53.15：資訊列右側名稱槽。改這幾列，或用網址 ?name= 覆蓋後備文字。 */
  const HOST_LABEL_DEFAULT = '老爺 × 咪姬';
  const HOST_CLIP = 'assets/duo.webm'; /* 循環短片（透明 VP9 webm）；檔案不在或載入失敗就顯示後備文字 */
  const HOST_SLOT_H = 220;             /* 與資訊列同高（設計像素） */
  const HOST_SLOT_ASPECT = 3;          /* 寬 = 高 × 這個比，預設約 3:1 → 660×220 */
  const HOST_SLOT_GAP = 24;            /* 資訊列右緣到金色分隔線 */
  const HOST_DIVIDER_GAP = 24;         /* 分隔線到影片框 */
  const HOST_LABEL = (function () {
    const q = String(params.get('name') || '').trim();
    return q || HOST_LABEL_DEFAULT;
  })();
  /* v53.16 s5：名稱槽已拿掉，不要把後備文字掛到全域。 */
  try { window.__OBS_HOST_LABEL = ''; } catch (e) {}
  const roomParam = String(params.get('room') || params.get('watch') || '').trim();
  const autoMode = /^(auto|latest)$/i.test(roomParam);
  function normalizeRoom(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    if (/^(auto|latest)$/i.test(s)) return '';
    /* 與 Sync.isIntRoom 一致：禁止前導 0，避免 0517752112 被解析成舊的 9 位房。 */
    if (/^[1-9][0-9]{0,9}$/.test(s)) return String(Number(s));
    if (window.Sync && Sync.roomKey) return Sync.roomKey(s);
    return s.toUpperCase();
  }
  let room = autoMode ? '' : normalizeRoom(roomParam);
  let lastGoodSnap = null;
  let unsubObs = null;
  const transparent = params.get('bg') === 'transparent' || params.get('transparent') === '1';
  /* 離線徽章已拿掉：WS 斷線與輪詢重連由 sync.js 默默處理，畫面不顯示「離線 · 等待重連」。 */
  if (window.Sync && Sync.onConn) {
    Sync.onConn(function (s) { window.__obsConn = s || {}; });
  }

  const res = String(params.get('res') || 'auto').toLowerCase();
  if (transparent) {
    document.documentElement.classList.add('transparent');
    document.body.classList.add('transparent');
  }

  const L = window.OBS_LAYOUT;
  const DESIGN_W = (L && L.DESIGN_W) || 3840;
  const DESIGN_H = (L && L.DESIGN_H) || 2160;
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NS = 'http://www.w3.org/2000/svg';
  const PINK = '#FF6F8E';
  const NEG = '#5B7FA6';
  const ZERO = '#8A7466';
  const INK = '#4A3B33';
  /* 映畫 T8c：結算牌加減分跟四角同一套顏色。+ 綠 #00873A、− 紅 #D60000（含 +／− 符號、含莊註記同色）。
     白底 #FFFDF8 上對比：綠 4.56:1、紅 5.35:1，都過 AA 內文 4.5:1 與大字 3:1（64px 粗體屬大字）。 */
  const SETTLE_POS = '#00873A';
  const SETTLE_NEG = '#D60000';
  function settleAmountFill(v) {
    v = Math.round(+v || 0);
    return v > 0 ? SETTLE_POS : v < 0 ? SETTLE_NEG : ZERO;
  }
  const HUD_SCALE = (L && L.TYPE && L.TYPE.hudScale) || 1;
  const HUD_W = 1160;
  const CARD_W = L.CARD_W;
  const CARD_H = L.CARD_H;
  const CARD_POS = L.CARD_POS;
  const TYPE = L.TYPE;
  const TX = L.TEXT;
  const CARD_COLOR = { tl: '#FFB7C5', tr: '#A8D8F0', bl: '#B9E4C9', br: '#FFD98A' };
  /* v53.16 s5：名稱槽整行拿掉（不要後備文字、不要短片）。artwork 檔案保留，只是不掛上。 */
  /* OBS 跟房主手機同一視角：主持永遠右下，下家右上、對家左上、上家左下。
     風位標籤仍是該席真門風。只依最新席次＋hostPid 推導。 */
  const OBS_CORNERS = ['br', 'tr', 'tl', 'bl'];
  function normSeat(i) { i = (+i || 0) | 0; return ((i % 4) + 4) % 4; }
  function cornerOfSeat(seat, hostSeat) {
    if (window.MJ && MJ.obsCornerOf) return MJ.obsCornerOf(seat, hostSeat);
    hostSeat = (hostSeat == null || hostSeat === '') ? 0 : normSeat(hostSeat);
    return OBS_CORNERS[(normSeat(seat) - hostSeat + 4) % 4];
  }
  function hostSeatOfSnap(snap) {
    if (snap && snap.hostPid && snap.players) {
      for (let i = 0; i < 4; i++) {
        if (snap.players[i] && String(snap.players[i].pid || '') === String(snap.hostPid)) return normSeat(i);
      }
    }
    if (snap && snap.hostSeat != null && snap.hostSeat !== '') {
      const n = Number(snap.hostSeat);
      if (n === n) return normSeat(n);
    }
    return 0;
  }
  /* cards-v2：分數顏色/格式以 obs-layout.js 為準（亮綠/紅/深灰） */
  const scoreFill = (L && L.scoreFill) ? L.scoreFill : function (v) { return v > 0 ? PINK : v < 0 ? NEG : ZERO; };
  const fmt = (L && L.fmtScore) ? L.fmtScore : function (n) {
    n = Math.round(+n || 0);
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  };

  const stage = document.getElementById('stage');
  const board = document.getElementById('board');
  const waitEl = document.getElementById('wait');
  const liveSvg = document.getElementById('live');
  let lastScores = null;
  let lastStamp = 0;
  let lastRenderKey = '';
  function raiseCornerCards() {
    if (!liveSvg || !live || !live.byCorner) return;
    ['br', 'tr', 'tl', 'bl'].forEach(function (k) {
      const card = live.byCorner[k];
      if (card && card.g && card.g.parentNode === liveSvg) liveSvg.appendChild(card.g);
    });
    if (live.hud && live.hud.parentNode === liveSvg) liveSvg.appendChild(live.hud);
  }
  function snapRenderKey(snap) {
    if (!snap) return '';
    const players = snap.players || [];
    const bits = [0, 1, 2, 3].map(function (i) {
      const p = players[i] || {};
      return [p.name, p.pid, p.wind, p.score, p.dealer, p.streak, p.mo, p.hu, p.qiang].join(':');
    });
    return [snap.rev, snap.title, snap.roundName, snap.wind, snap.dealerWind, snap.hostPid, snap.hostSeat, bits.join('|')].join('/');
  }
  const scoreAnims = [null, null, null, null];
  const live = { cards: {} };

  function fitStage() {
    /* viewBox SVG fills #stage (inset 0). No CSS scale — keeps names/scores/stats as crisp vector text. */
    if (stage) stage.style.transform = '';
  }
  function initSizeHint() {
    const el = document.getElementById('obs-size-hint');
    if (!el) return;
    if (String(params.get('hint') || '') === '0') {
      el.hidden = true;
      return;
    }
    let dismissed = false;
    let timer = null;
    const hide = function () {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      if (timer) { clearTimeout(timer); timer = null; }
    };
    const show = function () {
      if (dismissed) return;
      if (window.innerWidth >= 1920) { hide(); return; }
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { hide(); }, 10000);
    };
    const btn = el.querySelector('[data-act="dismissHint"]');
    if (btn) btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dismissed = true;
      hide();
    });
    window.addEventListener('resize', show);
    show();
  }
  fitStage();
  initSizeHint();
  window.addEventListener('resize', fitStage);

  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k in attrs) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function pawAt(parent, x, y, s, fill) {
    const g = el('g', { fill: fill, transform: 'translate(' + x + ',' + y + ') scale(' + s + ')' }, parent);
    el('ellipse', { cx: 0, cy: 12, rx: 22, ry: 18 }, g);
    [[-22, -14], [-8, -26], [8, -26], [22, -14]].forEach(function (p) {
      el('circle', { cx: p[0], cy: p[1], r: 9 }, g);
    });
    return g;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function signedMoney(n) {
    n = Math.round(+n || 0);
    return (n > 0 ? '+' : '') + n;
  }

  function buildLiveSvg() {
    if (!liveSvg) return;
    Object.keys(live.byCorner || live.cards || {}).forEach(function (k) { clearDeltaFlyup((live.byCorner || live.cards)[k]); });
    liveSvg.innerHTML = '';
    const hudX = (DESIGN_W - HUD_W * HUD_SCALE) / 2;
    const hud = el('g', { transform: 'translate(' + hudX + ',16) scale(' + HUD_SCALE + ')' }, liveSvg);
    el('rect', { width: 1160, height: 220, rx: 100, fill: '#FFFFFF', stroke: '#FFB7C5', 'stroke-width': 12 }, hud);
    if (L && L.paintMimi) L.paintMimi(el, hud, 110, 110, 180, 'badge');
    live.hudTitle = el('text', L.fontAttrs({ x: 610, y: 105, 'text-anchor': 'middle', 'font-size': TYPE.hudTitle || 80, 'font-weight': TYPE.hudTitleWeight || 900, fill: INK }), hud, '');
    live.hudSub = el('text', L.fontAttrs({ x: 610, y: 180, 'text-anchor': 'middle', 'font-size': TYPE.hudSub || 56, 'font-weight': TYPE.hudSubWeight || 800, fill: INK }), hud, '');
    pawAt(hud, 1060, 110, 1.4, '#FFB7C5');

    live.byCorner = {};
    ['tl', 'tr', 'bl', 'br'].forEach(function (k) {
      /* cards-v2：卡片由 obs-layout.js 的 buildCard 產生（同一組欄位／class／data-corner） */
      if (L.buildCard) { live.byCorner[k] = L.buildCard(el, liveSvg, k); return; }
      const color = CARD_COLOR[k];
      const g = el('g', { class: 'card', 'data-corner': k, 'data-w': String(CARD_W), 'data-h': String(CARD_H), transform: L.cardTransform(k) }, liveSvg);
      L.paintShell(el, g, color);
      const name = el('text', L.fontAttrs({ x: TX.cx, y: TX.nameY, 'text-anchor': 'middle', 'font-size': TYPE.name, 'font-weight': TYPE.nameWeight, fill: INK }), g, '');
      const score = el('text', L.fontAttrs({ x: TX.cx, y: TX.scoreY, 'text-anchor': 'middle', 'font-size': TYPE.score, 'font-weight': TYPE.scoreWeight, fill: ZERO }), g, '0');
      const stats = el('text', L.fontAttrs({ x: TX.cx, y: TX.statsY, 'text-anchor': 'middle', 'font-size': TYPE.stats, 'font-weight': TYPE.statsWeight || 800, fill: TYPE.statsFill }), g, '摸 0　胡 0　槍 0');
      const dealer = el('g', { class: 'card-dealer-tag', display: 'none' }, g);
      const dealerBg = el('rect', { class: 'card-dealer-bg', x: 0, y: 0, width: String(L.TAG_DEALER_W || 56), height: String(L.TAG_DEALER_H || 40), rx: 12, fill: PINK, stroke: '#fff', 'stroke-width': 3 }, dealer);
      const dealerLabel = el('text', L.fontAttrs({ x: String((L.TAG_DEALER_W || 68) / 2), y: String((L.TAG_DEALER_H || 48) * 0.72), 'text-anchor': 'middle', 'font-size': TYPE.dealer, 'font-weight': TYPE.dealerWeight || 900, fill: '#fff' }), dealer, '莊');
      const lianG = el('g', { class: 'card-lian', opacity: '0', display: 'none' }, g);
      const lianBg = el('rect', { class: 'card-lian-bg', fill: '#FFE3EA', stroke: '#fff', 'stroke-width': 3, x: 0, y: 0, width: 0, height: String(L.TAG_LIAN_H || 36), rx: 12 }, lianG);
      const lian = el('text', L.fontAttrs({ class: 'card-lian-label', x: 0, y: 0, 'text-anchor': 'middle', 'font-size': TYPE.lian, 'font-weight': TYPE.lianWeight || 800, fill: '#E45A78' }), lianG, '');
      live.byCorner[k] = { g: g, corner: k, name: name, score: score, stats: stats, dealer: dealer, dealerBg: dealerBg, dealerLabel: dealerLabel, lian: lian, lianG: lianG, lianBg: lianBg, delta: null };
    });
  }
  buildLiveSvg();

  /* ---- optional obs-websocket v5 camera blur (skip if params absent) ---- */
  const obsWsUrl = String(params.get('obs') || '').trim();
  const obsPw = params.get('obspw') || '';
  const obsCam = params.get('cam');
  const obsFilter = params.get('filter');
  const obsBlurEnabled = !!(obsWsUrl && obsCam && obsFilter && /^wss?:\/\//i.test(obsWsUrl));
  let obsSock = null;
  let obsIdentified = false;
  let obsReqId = 0;
  let blurOffTimer = null;

  function b64FromBuf(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }
  function sha256b64(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(b64FromBuf);
  }
  function connectObsWs() {
    if (!obsBlurEnabled) return;
    let sock;
    try { sock = new WebSocket(obsWsUrl); } catch (e) { return; }
    obsSock = sock;
    sock.addEventListener('message', function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.op === 0) {
        const d = msg.d || {};
        const identify = function (auth) {
          const payload = { op: 1, d: { rpcVersion: d.rpcVersion || 1 } };
          if (auth) payload.d.authentication = auth;
          try { sock.send(JSON.stringify(payload)); } catch (e) {}
        };
        if (d.authentication) {
          const salt = d.authentication.salt || '';
          const challenge = d.authentication.challenge || '';
          sha256b64(obsPw + salt).then(function (secret) {
            return sha256b64(secret + challenge);
          }).then(function (auth) { identify(auth); }).catch(function () { identify(); });
        } else identify();
      } else if (msg.op === 2) {
        obsIdentified = true;
      }
    });
    sock.addEventListener('close', function () {
      obsIdentified = false;
      if (obsSock === sock) obsSock = null;
    });
  }
  function setCamBlur(on) {
    if (!obsIdentified || !obsSock || obsSock.readyState !== 1) return false;
    obsReqId += 1;
    try {
      obsSock.send(JSON.stringify({
        op: 6,
        d: {
          requestType: 'SetSourceFilterEnabled',
          requestId: 'blur-' + obsReqId,
          requestData: {
            sourceName: obsCam,
            filterName: obsFilter,
            filterEnabled: !!on,
          },
        },
      }));
      return true;
    } catch (e) { return false; }
  }
  function beginWinBlur() {
    clearTimeout(blurOffTimer);
    setCamBlur(true);
    blurOffTimer = setTimeout(function () { setCamBlur(false); }, 4000);
  }
  function endWinBlur() {
    clearTimeout(blurOffTimer);
    setCamBlur(false);
  }
  window.addEventListener('pagehide', endWinBlur);
  window.addEventListener('beforeunload', endWinBlur);
  connectObsWs();

  /* ---- win animation iframe (version A / blur) ---- */
  const winLayer = document.getElementById('win-layer');
  const winFrame = document.getElementById('winanim');
  const animMode = (params.get('mode') || 'clear').toLowerCase() === 'blur' ? 'blur' : 'clear';
  if (winFrame) {
    const wq = new URLSearchParams();
    wq.set('mode', animMode);
    wq.set('v','53.16s11b');
    const sfx = params.get('sfx');
    const vol = params.get('vol') || params.get('volume');
    if (sfx != null && sfx !== '') wq.set('sfx', sfx);
    if (vol != null && vol !== '') wq.set('vol', vol);
    winFrame.src = 'obs-win.html?' + wq.toString();
  }

  function whenWinReady(cb) {
    if (!winFrame) return;
    const tryCall = function (n) {
      const w = winFrame.contentWindow;
      if (w && w.playWin && w.__ready) { cb(w); return; }
      if (n < 80) setTimeout(function () { tryCall(n + 1); }, 50);
    };
    if (winFrame.contentWindow && winFrame.contentWindow.__ready && winFrame.contentWindow.playWin) {
      cb(winFrame.contentWindow);
    } else {
      winFrame.addEventListener('load', function () { tryCall(0); }, { once: true });
      tryCall(0);
    }
  }

  let seenHandSeq = null;
  /* v53.13：同一手（同房、同手數、同牌型結果）只播一次；OBS 重整、重連時不重播上一手。 */
  let lastFiredKey = '';
  function handKeyOf(snap, lh) {
    const n = snap && snap.handsPlayed != null ? snap.handsPlayed : (snap && snap.hand != null ? snap.hand : '');
    return [room, n, lh.type, lh.winner, lh.loser, lh.headline, JSON.stringify(lh.parts || lh.deltas || '')].join('|');
  }
  function handSeqOf(snap) {
    if (!snap) return 0;
    if (snap.handSeq != null && snap.handSeq !== '') {
      const n = Number(snap.handSeq);
      return n === n ? n : 0;
    }
    if (snap.lastHand && snap.lastHand.seq != null && snap.lastHand.seq !== '') {
      const n = Number(snap.lastHand.seq);
      return n === n ? n : 0;
    }
    return 0;
  }
  function applyHandEvent(snap) {
    if (!snap) return;
    const seq = handSeqOf(snap);
    const lh = snap.lastHand;
    if (seenHandSeq == null) {
      /* Prime on first snapshot (including empty / no lastHand) so the first 自摸 still plays. */
      seenHandSeq = seq;
      if (lh) lastFiredKey = handKeyOf(snap, lh);
      return;
    }
    if (lh && seq !== seenHandSeq) {
      const key = handKeyOf(snap, lh);
      if (key !== lastFiredKey) {
        lastFiredKey = key;
        onNewHand(lh);
      }
    }
    seenHandSeq = seq;
  }
  let settleTimer = null;
  let queuedSettle = null;
  let winPlaying = false;
  let parkedLive = null;

  function parkLiveBoard() {
    clearSettle();
    if (liveSvg) {
      parkedLive = liveSvg;
      liveSvg.style.visibility = 'hidden';
      liveSvg.setAttribute('visibility', 'hidden');
      liveSvg.setAttribute('aria-hidden', 'true');
    }
  }
  function unparkLiveBoard() {
    if (parkedLive) {
      parkedLive.style.visibility = '';
      parkedLive.removeAttribute('visibility');
      parkedLive.removeAttribute('aria-hidden');
    }
    parkedLive = null;
  }
  function clearSettle() {
    clearTimeout(settleTimer);
    settleTimer = null;
    const g = live.settle;
    if (g && g.parentNode) g.parentNode.removeChild(g);
    live.settle = null;
  }
  function settleFootLines(lh) {
    /* 只顯示計分結果（scoring.js）已經算好的數字，OBS 自己不算莊連拉。
       共計：winAnim.total（MJ.buildWinAnimData）；沒有 winAnim 時用 lastHand.tai（App 標題同一個數）。
       莊連拉／莊家另付：只用 winAnim.dealerExtra.line；莊家胡／莊家放槍時，莊家、連N拉N 已在 winAnim.items 逐行列出。
       沒有 winAnim 時讀 lastHand.dealerExtra.line（App 由 computeState 帶出）；兩者都沒有就不畫（不自己推算）。 */
    const out = [];
    if (lh && lh.type === 'zhahu') {
      out.push({ kind: 'note', text: '每家 1 底' });
      const deltas = lh.deltas || [];
      let total = 0;
      for (let i = 0; i < deltas.length; i++) {
        const d = Math.round(+deltas[i] || 0);
        if (d > 0) total += d;
      }
      out.push({ kind: 'total-money', amount: total });
      return out;
    }
    if (!lh || (lh.type !== 'zimo' && lh.type !== 'hu')) return out;
    const wa = lh.winAnim || null;
    let total = null;
    if (wa && wa.total != null && isFinite(+wa.total)) total = Math.round(+wa.total);
    else if (lh.tai != null && isFinite(+lh.tai)) total = Math.round(+lh.tai);
    if (total != null) out.push({ kind: 'total', tai: total });
    if (wa && wa.dealerExtra && wa.dealerExtra.line) out.push({ kind: 'note', text: String(wa.dealerExtra.line) });
    /* s8h：沒有 winAnim 時改讀 lastHand.dealerExtra（App 從 computeState 帶出來的，OBS 不自己算）。 */
    else if (!wa && lh.dealerExtra && lh.dealerExtra.line) out.push({ kind: 'note', text: String(lh.dealerExtra.line) });
    return out;
  }
  function showSettle(lh) {
    if (window.LiveFlags && LiveFlags.get().winAnim === false) return;
    if (!lh) return;
    clearSettle();
    if (!liveSvg || !liveSvg.parentNode) unparkLiveBoard();
    if (!liveSvg) return;
    const root = el('g', { id: 'obs-settle', 'data-kind': String(lh.type || '') }, liveSvg);
    live.settle = root;
    /* Dim only behind the center plaque so corner cards stay visible and can
       keep updating (score count-up) while 結算／大牌 overlay the middle. */
    const itemCount = (function () {
      const raw = (lh && lh.parts && lh.parts.length) ? lh.parts
        : (lh && lh.winAnim && lh.winAnim.items) ? lh.winAnim.items : [];
      const nz = raw.filter(function (it) { return Array.isArray(it) ? Number(it[1]) !== 0 : (it && Number(it.tai) !== 0); });
      return (nz.length || Math.min(1, raw.length)) || 0;
    })();
    /* v53.16 s8h P3-5：備用結算牌（沒有 winAnim、或詐胡等）也寫「共計」與「莊連拉另計／莊家另付」，跟主動畫卡一致。
       只是顯示：數字全部來自計分結果（winAnim.total／dealerExtra.line、lastHand.tai），不改任何計分。 */
    const settleFoot = settleFootLines(lh);
    const isZhahu = !!(lh && lh.type === 'zhahu');
    const cw = 1480;
    const PAD = 48; /* 約 24px（1080p 預覽是 4K 的一半） */
    const rowH = 92;
    const nRows = 4;
    /* 副標與「每家 1 底」要有足夠行距，避免疊在一起。 */
    const kickerY = PAD + 36, capY = PAD + 156, subY = PAD + 216, noteY = PAD + 286, noteAfter = 28;
    const zhahuNotes = isZhahu ? settleFoot.filter(function (f) { return f.kind === 'note'; }) : [];
    const zhahuTotal = isZhahu ? settleFoot.filter(function (f) { return f.kind === 'total' || f.kind === 'total-money'; }) : [];
    let ch, cx, cy;
    if (isZhahu) {
      /* 標題區＋n 列＋底部共計，高度跟內容走；3 列／4 列都用同一套公式。 */
      const headH = (zhahuNotes.length ? noteY + 52 + noteAfter : subY + 36 + noteAfter) - PAD;
      const totalH = zhahuTotal.length ? 72 : 0;
      ch = PAD + headH + nRows * rowH + totalH + PAD;
      cx = (DESIGN_W - cw) / 2;
      cy = (DESIGN_H - ch) / 2;
      const hudBottom = 16 + 220 + 12;
      const cornerTop = DESIGN_H - 16 - ((L && L.CARD_H) || 336);
      const safeGap = 24;
      if (cy < hudBottom + safeGap) cy = hudBottom + safeGap;
      if (cy + ch > cornerTop - safeGap) cy = cornerTop - safeGap - ch;
    } else {
      ch = 1180 + Math.max(0, itemCount - 1) * 58 + settleFoot.length * 58;
      cx = (DESIGN_W - cw) / 2;
      cy = (DESIGN_H - ch) / 2;
    }
    el('rect', { x: cx + 16, y: cy + 22, width: cw, height: ch, rx: 64, fill: '#7A3A4A', opacity: '.16' }, root);
    const box = el('rect', { x: cx, y: cy, width: cw, height: ch, rx: 64, fill: '#FFFDF8', stroke: '#FFB7C5', 'stroke-width': 10 }, root);
    box.setAttribute('data-settle-box', '1');
    box.setAttribute('data-settle-ch', String(ch));
    box.setAttribute('data-settle-rows', String(nRows));
    el('text', L.fontAttrs({ x: DESIGN_W / 2, y: cy + (isZhahu ? kickerY : 110), 'text-anchor': 'middle', 'font-size': 36, 'font-weight': 700, fill: '#6B5A48', 'letter-spacing': '0.28em' }), root, '這一手');
    const cap = el('text', L.fontAttrs({ x: DESIGN_W / 2, y: cy + (isZhahu ? capY : 240), 'text-anchor': 'middle', 'font-size': 108, 'font-weight': 900, fill: '#3A2E25' }), root, lh.headline || '');
    cap.setAttribute('data-settle-caption', '1');
    if (isZhahu) {
      const names0 = lh.names || [];
      const pids0 = lh.pids || [];
      let dealerNm = lh.dealerName || '';
      if (!dealerNm && lh.dealerPid && pids0.length) {
        const di = pids0.indexOf(lh.dealerPid);
        if (di >= 0) dealerNm = names0[di] || '';
      }
      if (!dealerNm) dealerNm = names0[lh.dealer] || '—';
      const st = Number(lh.streak) || 0;
      const lian = st === 0 ? '剛當莊' : ('連' + st + '拉' + st);
      const sub = el('text', L.fontAttrs({ x: DESIGN_W / 2, y: cy + subY, 'text-anchor': 'middle', 'font-size': 40, 'font-weight': 700, fill: '#6B5A48' }), root, '莊家 ' + dealerNm + ' · ' + lian);
      sub.setAttribute('data-settle-zhahu-dealer', '1');
    }
    /* 大牌與自摸／胡牌資訊同時出現在結算區：一行一個牌型＋台數，不再另跳延遲大牌卡。 */
    function settleItems(lh) {
      const raw = (lh && lh.parts && lh.parts.length) ? lh.parts
        : (lh && lh.winAnim && lh.winAnim.items && lh.winAnim.items.length) ? lh.winAnim.items
        : [];
      /* v53.13：0 台的行不顯示（只剩 0 台的屁胡除外）。v53.15：屁胡＋莊家顯示「屁胡・莊家」。
         OBS 頁不載入 scoring.js，這段邏輯須寫在這裡（與 MJ.decorateSettleItems 相同）。 */
      const named = [];
      raw.forEach(function (it) {
        if (Array.isArray(it)) named.push({ name: String(it[0] || ''), tai: Number(it[1]) || 0 });
        else if (it && it.name) named.push({ name: String(it.name), tai: Number(it.tai) || 0 });
      });
      const withName = named.filter(function (p) { return p.name; });
      const nz = withName.filter(function (p) { return p.tai !== 0; });
      const hasPihu = withName.some(function (p) { return p.name === '屁胡'; });
      if (hasPihu && nz.some(function (p) { return p.name === '莊家'; })) {
        return nz.map(function (p) { return p.name === '莊家' ? { name: '屁胡・莊家', tai: p.tai } : p; });
      }
      return nz.length ? nz : withName.slice(0, 1);
    }
    const items = settleItems(lh);
    let y = cy + (isZhahu ? noteY : 320);
    if (isZhahu) {
      zhahuNotes.forEach(function (f) {
        const n = el('text', L.fontAttrs({ x: DESIGN_W / 2, y: y, 'text-anchor': 'middle', 'font-size': 38, 'font-weight': 700, fill: '#8A6E54' }), root, f.text);
        n.setAttribute('data-settle-dealer-extra', '1');
        y += 52;
      });
      y += noteAfter;
    } else if (items.length) {
      items.forEach(function (p) {
        const nameEl = el('text', L.fontAttrs({ x: cx + 160, y: y, 'font-size': 44, 'font-weight': 700, fill: '#3A2E25' }), root, p.name);
        nameEl.setAttribute('data-fan', p.name);
        const taiEl = el('text', L.fontAttrs({ x: cx + cw - 160, y: y, 'text-anchor': 'end', 'font-size': 44, 'font-weight': 800, fill: '#5E3F27' }), root, p.tai + ' 台');
        taiEl.setAttribute('data-fan-tai', p.name);
        y += 58;
      });
      y += 12;
    }
    /* 自摸／胡的備用結算牌：共計（台）仍在牌型列下方、玩家列上方，避免改到已通過的胡牌卡。 */
    if (!isZhahu) {
      settleFoot.forEach(function (f) {
        if (f.kind === 'total' || f.kind === 'total-money') {
          el('line', { x1: cx + 160, y1: y - 40, x2: cx + cw - 160, y2: y - 40, stroke: 'rgba(180,150,110,.35)', 'stroke-width': 2 }, root);
          const unit = f.kind === 'total-money' ? ' 元' : ' 台';
          const val = f.kind === 'total-money' ? f.amount : f.tai;
          const a = el('text', L.fontAttrs({ x: cx + 160, y: y + 4, 'font-size': 46, 'font-weight': 900, fill: '#3A2E25' }), root, '共計');
          a.setAttribute('data-settle-total', String(val));
          if (f.kind === 'total-money') a.setAttribute('data-settle-total-unit', 'yuan');
          el('text', L.fontAttrs({ x: cx + cw - 160, y: y + 4, 'text-anchor': 'end', 'font-size': 46, 'font-weight': 900, fill: '#C8473A' }), root, val + unit);
        } else {
          const n = el('text', L.fontAttrs({ x: DESIGN_W / 2, y: y, 'text-anchor': 'middle', 'font-size': 38, 'font-weight': 700, fill: '#8A6E54' }), root, f.text);
          n.setAttribute('data-settle-dealer-extra', '1');
        }
        y += 58;
      });
    }
    const mimiUse = (L && L.paintMimi) ? L.paintMimi(el, root, cx + cw - 150, cy + (isZhahu ? PAD + 90 : 150), 180, 'plaque') : null;
    /* T8c P2：詐胡標題縮字避開右上角貓。T4d：字型載入後（document.fonts.ready）再量一次，避免冷啟動用後備字寬。 */
    function fitZhahuCaption(capEl, mimiNode) {
      if (!capEl) return;
      const minClear = 16;
      let catLeft = null;
      if (mimiNode && mimiNode.getBBox) {
        try { catLeft = mimiNode.getBBox().x; } catch (e) { catLeft = null; }
      }
      if (catLeft == null) {
        const mimiW = 180 * (590 / 760);
        catLeft = cx + cw - 150 - mimiW / 2;
      }
      const mid = DESIGN_W / 2;
      const maxHalf = catLeft - mid - minClear;
      const maxW = maxHalf > 0 ? maxHalf * 2 : 0;
      let fs = 108;
      capEl.setAttribute('font-size', String(fs));
      capEl.removeAttribute('textLength');
      capEl.removeAttribute('lengthAdjust');
      function capW() {
        try { return capEl.getComputedTextLength(); } catch (e) { return 0; }
      }
      let w = capW();
      while (maxW > 0 && w > maxW && fs > 60) {
        fs -= 1;
        capEl.setAttribute('font-size', String(fs));
        w = capW();
      }
      if (maxW > 0 && w > maxW) {
        capEl.setAttribute('textLength', String(maxW));
        capEl.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        w = maxW;
      }
      const clear = w ? (catLeft - (mid + w / 2)) : null;
      capEl.setAttribute('data-settle-caption-fs', String(fs));
      if (clear != null) capEl.setAttribute('data-settle-caption-clear', String(Math.round(clear * 10) / 10));
    }
    if (isZhahu && cap) {
      fitZhahuCaption(cap, mimiUse);
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () {
          if (cap && cap.ownerSVGElement && cap.ownerSVGElement.isConnected) fitZhahuCaption(cap, mimiUse);
        }).catch(function () {});
      }
    }

    const names = lh.names || [];
    /* T8b：共計要跟人名左齊、跟金額右齊，字級也要相同。
       含莊從金額 text 拆成旁邊獨立的字，所有「N 元」共用同一個右緣（AMT_X）。
       不能只改 styles.css：這是 SVG 幾何屬性 x 與同一節點裡的 tspan，CSS 改不了右齊基準。 */
    const NAME_X = cx + 120;
    const AMT_X = isZhahu ? (cx + cw - 400) : (cx + cw - 500);
    const HAN_GAP = 16;
    if (!isZhahu) y += 40;
    for (let i = 0; i < 4; i++) {
      const d = Math.round(+(lh.deltas && lh.deltas[i]) || 0);
      const tot = Math.round(+(lh.totals && lh.totals[i]) || 0);
      const fill = settleAmountFill(d);
      const dtxt = (d > 0 ? '+' : (d < 0 ? '\u2212' : '')) + Math.abs(d);
      el('line', { x1: cx + 80, y1: y, x2: cx + cw - 80, y2: y, stroke: 'rgba(180,150,110,.35)', 'stroke-width': 2 }, root);
      const nameEl = el('text', L.fontAttrs({ x: NAME_X, y: y + 62, 'font-size': 52, 'font-weight': 700, fill: INK }), root, names[i] || '—');
      if (isZhahu) nameEl.setAttribute('data-settle-name', String(i));
      /* T8：金額標「元」，含莊標「台」；含莊註記跟加減分同色。犯規列也寫含莊。 */
      const dEl = el('text', L.fontAttrs({ x: AMT_X, y: y + 62, 'text-anchor': 'end', 'font-size': 64, 'font-weight': 800, fill: fill }), root, dtxt + (isZhahu ? ' 元' : ''));
      dEl.setAttribute('data-settle-delta', String(i));
      dEl.setAttribute('data-settle-fill', fill);
      const dx = isZhahu && lh.dealerExtraBySeat ? Math.round(+lh.dealerExtraBySeat[i] || 0) : 0;
      if (isZhahu && dx > 0 && d !== 0) {
        const extras = lh.dealerExtraBySeat || [];
        const others = [0, 1, 2, 3].filter(function (j) { return j !== i && Math.round(+extras[j] || 0) > 0; })
          .map(function (j) { return Math.round(+extras[j] || 0); });
        const unit = others.length ? others[0] : 0;
        const same = unit > 0 && others.every(function (v) { return v === unit; }) && unit * others.length === dx && others.length > 1;
        /* 映畫已定：寫「含莊 5 台×3」，避免被看成單筆 15 台。 */
        const han = same ? ('（含莊 ' + unit + ' 台×' + others.length + '）') : ('（含莊 ' + dx + ' 台）');
        const ts = el('text', L.fontAttrs({ x: AMT_X + HAN_GAP, y: y + 62, 'text-anchor': 'start', 'font-size': 36, 'font-weight': 700, fill: fill }), root, han);
        ts.setAttribute('data-settle-dealer-tai', String(dx));
        if (same) ts.setAttribute('data-settle-han-mul', unit + 'x' + others.length);
      }
      if (!isZhahu) {
        el('text', L.fontAttrs({ x: cx + cw - 120, y: y + 62, 'text-anchor': 'end', 'font-size': 40, fill: '#6B5A48' }), root, '餘 ' + signedMoney(tot));
      }
      y += isZhahu ? rowH : 110;
    }
    /* 詐胡：共計放到列表最下面，上方一條分隔線，和確認單相同。左齊人名、右齊金額、字級相同。 */
    if (isZhahu) {
      zhahuTotal.forEach(function (f) {
        const unit = f.kind === 'total-money' ? ' 元' : ' 台';
        const val = f.kind === 'total-money' ? f.amount : f.tai;
        el('line', { x1: NAME_X, y1: y + 8, x2: AMT_X, y2: y + 8, stroke: 'rgba(180,150,110,.35)', 'stroke-width': 2 }, root);
        const a = el('text', L.fontAttrs({ x: NAME_X, y: y + 62, 'font-size': 52, 'font-weight': 700, fill: INK }), root, '共計');
        a.setAttribute('data-settle-total', String(val));
        if (f.kind === 'total-money') a.setAttribute('data-settle-total-unit', 'yuan');
        /* 映畫 T8c：詐胡卡「共計 N 元」改跟人名同一色 INK，加粗保留。確認單共計仍是酒紅，不改。 */
        const amt = el('text', L.fontAttrs({ x: AMT_X, y: y + 62, 'text-anchor': 'end', 'font-size': 64, 'font-weight': 800, fill: INK }), root, val + unit);
        amt.setAttribute('data-settle-total-amt', String(val));
        y += 72;
      });
    }

    clearTimeout(settleTimer);
    settleTimer = setTimeout(clearSettle, 8000);
    raiseCornerCards();
  }

  function stopOverlayWin() {
    if (winFrame && winFrame.contentWindow && winFrame.contentWindow.stopWin) {
      try { winFrame.contentWindow.stopWin(); } catch (e) {}
    }
    if (winLayer) {
      winLayer.classList.remove('on');
      winLayer.setAttribute('aria-hidden', 'true');
    }
    if (winPlaying) unparkLiveBoard();
    winPlaying = false;
    endWinBlur();
  }
  function applyLiveFlags(flags) {
    flags = flags || (window.LiveFlags && LiveFlags.get()) || { obsOverlay: true, winAnim: true };
    const overlayOff = flags.obsOverlay === false;
    document.documentElement.classList.toggle('live-obs-off', overlayOff);
    document.body.classList.toggle('live-obs-off', overlayOff);
    if (overlayOff || flags.winAnim === false) {
      stopOverlayWin();
      clearSettle();
      queuedSettle = null;
    }
    try {
      if (winFrame && winFrame.contentWindow) {
        winFrame.contentWindow.postMessage({ type: 'liveFlags', flags: flags }, location.origin);
      }
    } catch (e) {}
  }
  window.__applyLiveFlags = applyLiveFlags;

  function bootLiveFlags() {
    if (!window.LiveFlags) return;
    if (room) LiveFlags.setRoom(room);
    document.documentElement.classList.add('live-obs-pending');
    document.body.classList.add('live-obs-pending');
    var cleared = false;
    function clearPending() {
      if (cleared) return;
      cleared = true;
      clearTimeout(bootLiveFlags._t);
      document.documentElement.classList.remove('live-obs-pending');
      document.body.classList.remove('live-obs-pending');
    }
    bootLiveFlags._t = setTimeout(function () {
      clearPending();
      applyLiveFlags(LiveFlags.get());
    }, 1500);
    LiveFlags.onChange(function (flags) {
      clearPending();
      applyLiveFlags(flags);
    });
    LiveFlags.start();
  }

  function playWinSfxOnly() {
    whenWinReady(function (w) {
      try {
        if (w.__resetWinSfx) w.__resetWinSfx();
        if (w.__playWinSfx) {
          w.__playWinSfx('star_whoosh');
          setTimeout(function () { try { w.__playWinSfx('heart_ding'); } catch (e) {} }, 180);
          setTimeout(function () { try { w.__playWinSfx('goal_finish'); } catch (e) {} }, 360);
        }
      } catch (e) {}
    });
  }

  /* v53.7：恢復昨天（11/12 直播）原版自摸／胡牌震撼動畫——obs-win 全螢幕主動畫
     （＋清一色／碰碰胡子動畫）完整播完，期間暫藏底下四角卡，播完再恢復。 */
  /* v53.16：胡牌動畫卡也合併「屁胡＋莊家」為「屁胡・莊家」。只改卡上文字，不改動畫時間、畫面或音效。 */
  function decorateWinAnim(data) {
    if (!data || !data.items || !data.items.length) return data;
    const named = [];
    data.items.forEach(function (it) {
      if (Array.isArray(it)) named.push({ name: String(it[0] || ''), tai: Number(it[1]) || 0 });
      else if (it && it.name) named.push({ name: String(it.name), tai: Number(it.tai) || 0 });
    });
    const withName = named.filter(function (p) { return p.name; });
    const nz = withName.filter(function (p) { return p.tai !== 0; });
    const hasPihu = withName.some(function (p) { return p.name === '屁胡'; });
    const shown = (hasPihu && nz.some(function (p) { return p.name === '莊家'; }))
      ? nz.map(function (p) { return p.name === '莊家' ? { name: '屁胡・莊家', tai: p.tai } : p; })
      : (nz.length ? nz : withName.slice(0, 1));
    const out = {};
    Object.keys(data).forEach(function (k) { out[k] = data[k]; });
    out.items = shown.map(function (p) { return [p.name, p.tai]; });
    return out;
  }
  function playOverlayWin(data) {
    if (window.LiveFlags && LiveFlags.get().winAnim === false) return;
    if (!data || !winLayer || !winFrame) return;
    data = decorateWinAnim(data);
    whenWinReady(function (w) {
      clearSettle();
      queuedSettle = null;
      parkLiveBoard();
      winPlaying = true;
      winLayer.classList.add('on');
      winLayer.setAttribute('aria-hidden', 'false');
      w.onWinDone = function () {
        winLayer.classList.remove('on');
        winLayer.setAttribute('aria-hidden', 'true');
        winPlaying = false;
        unparkLiveBoard();
        endWinBlur();
        if (queuedSettle) {
          const q = queuedSettle;
          queuedSettle = null;
          showSettle(q);
        }
      };
      if (animMode !== 'clear') beginWinBlur();
      w.playWin(data);
    });
  }
  window.playOverlayWin = playOverlayWin;
  /* s8i 測試用：直接畫結算牌（共計＝明細加總檢查）。 */
  window.__OBS_SHOW_SETTLE__ = showSettle;
  window.__OBS_BUSY__ = function () {
    try {
      if (winPlaying) return true;
      /* v53.16 s8i：結算牌（8 秒）顯示中或排隊等著顯示時也不重載，等它收掉。 */
      if (queuedSettle || (live && live.settle && live.settle.parentNode)) return true;
      const draw = document.getElementById('draw-layer');
      if (draw && draw.classList && draw.classList.contains('on')) return true;
    } catch (e) {}
    return false;
  };

  let drawOverlayTimer = null;
  function hideDrawOverlay() {
    const layer = document.getElementById('draw-layer');
    if (!layer) return;
    layer.classList.remove('on');
    layer.setAttribute('aria-hidden', 'true');
    layer.removeAttribute('data-draw-overlay');
    clearTimeout(drawOverlayTimer);
    drawOverlayTimer = null;
  }
  function showDrawOverlay(lh) {
    const layer = document.getElementById('draw-layer');
    if (!layer || !lh) return;
    const word = layer.querySelector('.draw-word') || layer;
    const keep = lh.dealerContinues !== false;
    word.textContent = lh.headline || (keep ? '流局・連莊' : '流局');
    layer.setAttribute('aria-hidden', 'false');
    layer.setAttribute('data-draw-overlay', '1');
    layer.classList.remove('on');
    void layer.offsetWidth;
    layer.classList.add('on');
    clearTimeout(drawOverlayTimer);
    drawOverlayTimer = setTimeout(hideDrawOverlay, 1500);
  }

  function onNewHand(lh) {
    if (!lh) return;
    const isWin = (lh.type === 'zimo' || lh.type === 'hu');
    const isDraw = lh.type === 'draw';
    /* 自摸／胡牌：結算區（標題＋每一項大牌台數）立刻出現，不等待 obs-win 的
       8 秒動畫、也不等牌型列從 t=1.85 起再一列列淡入。
       流局改走淡字 overlay，不再用同一塊大結算牌（那會跟自摸一樣大、停留 8 秒）。 */
    if (isDraw) {
      hideDrawOverlay();
      clearSettle();
      showDrawOverlay(lh);
      return;
    }
    if (window.LiveFlags && LiveFlags.get().winAnim === false) return;
    hideDrawOverlay();
    if (isWin && lh.winAnim) {
      /* 原版：自摸／胡牌播完整震撼動畫（動畫本身含牌型台數列）。 */
      queuedSettle = null;
      playOverlayWin(lh.winAnim);
      return;
    }
    /* 詐胡等其他結算：動畫播放中就排隊，播完再顯示結算牌。 */
    if (winPlaying) { queuedSettle = lh; return; }
    showSettle(lh);
    if (isWin) playWinSfxOnly();
  }

  function animateScore(el, from, to, i) {
    if (scoreAnims[i]) cancelAnimationFrame(scoreAnims[i]);
    const paint = function (v) {
      if (L.setCardScore) { L.setCardScore(el, v); return; }
      el.textContent = fmt(v);
      el.setAttribute('fill', scoreFill(v));
    };
    if (reduceMotion || from === to || from == null) {
      paint(to);
      scoreAnims[i] = null;
      return;
    }
    const start = performance.now();
    const dur = 620;
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      paint(Math.round(from + (to - from) * ease));
      if (t < 1) scoreAnims[i] = requestAnimationFrame(tick);
      else scoreAnims[i] = null;
    }
    paint(from);
    scoreAnims[i] = requestAnimationFrame(tick);
  }

  function setCardDealer(card, on) {
    if (!card || !card.dealer) return;
    if (on) card.dealer.removeAttribute('display');
    else card.dealer.setAttribute('display', 'none');
    layoutCardTags(card);
  }
  function setCardLian(card, text) {
    if (!card || !card.lian) return;
    const g = card.lianG;
    const label = card.lian;
    if (!text) {
      label.textContent = '';
      if (g) {
        g.setAttribute('opacity', '0');
        g.setAttribute('display', 'none');
      } else {
        label.setAttribute('opacity', '0');
      }
      layoutCardTags(card);
      return;
    }
    label.textContent = text;
    if (g) {
      g.setAttribute('display', '');
      g.setAttribute('opacity', '1');
    } else {
      label.setAttribute('opacity', '1');
    }
    layoutCardTags(card);
  }
  function layoutCardTags(card) {
    if (!card) return;
    const side = (L.tagSide ? L.tagSide(card.corner) : ((card.corner === 'tr' || card.corner === 'br') ? 'left' : 'right'));
    const gap = L.TAG_GAP || 10;
    const tagY = L.TAG_Y || 24;
    const dealerW = L.TAG_DEALER_W || 56;
    const dealerH = L.TAG_DEALER_H || 40;
    const lianH = L.TAG_LIAN_H || 36;
    const stack = L.TAG_STACK || 8;
    const dealerOn = !!(card.dealer && card.dealer.getAttribute('display') !== 'none');
    const lianOn = !!(card.lian && card.lian.textContent && card.lianG && card.lianG.getAttribute('display') !== 'none');
    if (card.dealer) {
      const x = side === 'right' ? (CARD_W + gap) : (-gap - dealerW);
      card.dealer.setAttribute('transform', 'translate(' + x + ',' + tagY + ')');
    }
    if (card.lianG && card.lianBg && card.lian) {
      const label = card.lian;
      const bg = card.lianBg;
      let w = 0;
      try { w = label.getComputedTextLength(); } catch (e) {}
      if (!w) w = String(label.textContent || '').length * ((TYPE && TYPE.lian) || 26) * 0.92;
      const padX = 16;
      const width = Math.max(96, w + padX * 2);
      const y = dealerOn ? (tagY + dealerH + stack) : tagY;
      const x = side === 'right' ? (CARD_W + gap) : (-gap - width);
      bg.setAttribute('x', '0');
      bg.setAttribute('y', '0');
      bg.setAttribute('width', String(width));
      bg.setAttribute('height', String(lianH));
      bg.setAttribute('rx', String(lianH / 2));
      label.setAttribute('x', String(width / 2));
      label.setAttribute('y', String(lianH * 0.72));
      card.lianG.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    }
  }

  function clearDeltaFlyup(card) {
    if (!card) return;
    clearTimeout(card._deltaT);
    card._deltaT = null;
    if (card.delta && card.delta.parentNode) card.delta.parentNode.removeChild(card.delta);
    card.delta = null;
  }
  function showDeltaFlyup(card, d) {
    /* Always start from a clean DOM node so back-to-back hands cannot leave a ghost +N. */
    clearDeltaFlyup(card);
    d = Math.round(+d || 0);
    if (!d || !card || !card.g) return;
    const dp = L.deltaPos ? L.deltaPos(card.corner) : { x: TX.deltaX, y: TX.deltaY };
    card.delta = el('text', L.fontAttrs({
      x: dp.x, y: dp.y, 'text-anchor': 'middle',
      'font-size': L.deltaPos ? 72 : TYPE.stats, 'font-weight': L.deltaPos ? 900 : 700, fill: scoreFill(d),
      stroke: '#FFFFFF', 'stroke-width': L.deltaPos ? 12 : 0, 'paint-order': 'stroke', 'stroke-linejoin': 'round',
      'class': 'obs-delta-flyup'
    }), card.g, fmt(d));
    card._deltaT = setTimeout(function () { clearDeltaFlyup(card); }, 1800);
  }

  function roomLabelOf(code) {
    if (window.Sync && Sync.roomLabel) return Sync.roomLabel(code);
    return /^\d+$/.test(String(code || '')) ? (Number(code) + ' 號房') : String(code || '');
  }
  function sameRoom(snap) {
    if (!snap || snap.room == null || snap.room === '') return true;
    return normalizeRoom(snap.room) === room;
  }
  function switchToRoom(dest, opts) {
    dest = normalizeRoom(dest);
    if (!dest || dest === room) return;
    room = dest;
    window.__obsRoom = room;
    if (window.LiveFlags) LiveFlags.setRoom(room);
    /* Keep the last painted frame until the new room snap arrives. Never flash the wait panel. */
    lastStamp = 0;
    seenHandSeq = null;
    lastScores = null;
    if (!(opts && opts.keepAuto)) {
      try {
        const u = new URL(location.href);
        u.searchParams.set('room', room);
        history.replaceState({}, '', u.pathname + u.search + u.hash);
      } catch (e) {}
    }
    if (unsubObs) try { unsubObs(); } catch (e) {}
    if (window.Sync) unsubObs = Sync.subscribe(room, onObsSnap);
  }
  function followMovedTo(dest) {
    switchToRoom(dest, { keepAuto: autoMode });
  }
  function latestUrl() {
    var origin = (window.Sync && Sync.endpoint && Sync.endpoint()) || (typeof location !== 'undefined' ? location.origin : '');
    return origin + '/api/rooms/latest';
  }
  function applyLatest(data) {
    var next = data && data.room != null && data.room !== '' ? normalizeRoom(data.room) : '';
    if (!next) {
      /* Server blip / empty latest: if we already showed a room, keep the last frame and retry. */
      if (lastGoodSnap || room) return;
      showWaiting('auto');
      return;
    }
    if (next === room) return;
    switchToRoom(next, { keepAuto: true });
  }
  function pollLatest() {
    fetch(latestUrl() + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(applyLatest)
      .catch(function () {});
  }
  function startAutoFollow() {
    showWaiting('auto');
    pollLatest();
    setInterval(pollLatest, 1500);
  }
  function isStoreLockedSnap(snap) {
    return !!(snap && (snap.code === 'store-locked' || snap.error === 'store-locked' || snap.storeLocked));
  }
  function onObsSnap(snap) {
    if (!snap) return;
    if (isStoreLockedSnap(snap)) {
      /* s11 T2：已有牌桌就停在最後一個畫面；還沒有桌就顯示準備中。不可把 503 當牌桌畫上去。 */
      if (lastGoodSnap || (board && board.classList.contains('has-frame'))) return;
      showWaiting('store-locked');
      return;
    }
    if (snap.movedTo && normalizeRoom(snap.movedTo) !== room) {
      followMovedTo(snap.movedTo);
      return;
    }
    if ((snap.empty || !snap.players) && lastGoodSnap && !snap.movedTo && snap.status !== 'deleted' && snap.status !== 'purged') return;
    if (snap && !snap.empty && snap.players && snap.status !== 'deleted' && snap.status !== 'purged') lastGoodSnap = snap;
    /* Re-render on every snapshot with players, including seat swaps (rev change,
       no new hand). Corner cards update immediately; overlays sit on top. */
    render(snap);
  }
  function waitHtml(kind) {
    /* s10：待機畫面不顯示房號、網址、IP 或連接埠。 */
    return '麻將療癒師・準備中';
  }
  function showWaiting(kind) {
    /* Once a room has painted, never cover it with the wait panel; silently keep the last frame. */
    if (lastGoodSnap || (board && board.classList.contains('has-frame'))) {
      board.classList.add('has-frame', 'ready');
      board.classList.remove('waiting', 'wait-auto');
      return;
    }
    board.classList.remove('ready');
    board.classList.add('waiting');
    if (kind === 'auto' || (autoMode && !room)) board.classList.add('wait-auto');
    else board.classList.remove('wait-auto');
    if (waitEl) waitEl.innerHTML = waitHtml(kind);
  }
  function render(snap) {
    if (isStoreLockedSnap(snap)) {
      if (lastGoodSnap) return;
      showWaiting('store-locked');
      return;
    }
    if (!snap || snap.empty) {
      if (lastGoodSnap) return;
      showWaiting('empty');
      applyHandEvent(snap || { handSeq: 0 });
      return;
    }
    if (snap.movedTo && normalizeRoom(snap.movedTo) !== room) {
      followMovedTo(snap.movedTo);
      return;
    }
    if (!sameRoom(snap) && !snap.movedTo) return;
    if ((snap.status === 'deleted' || snap.status === 'purged') && !snap.movedTo) {
      if (lastGoodSnap || (board && board.classList.contains('has-frame'))) {
        if (autoMode) pollLatest();
        return;
      }
      if (autoMode) {
        pollLatest();
        showWaiting('auto');
        return;
      }
      showWaiting(snap.status === 'purged' ? 'purged' : 'deleted');
      return;
    }
    board.classList.add('ready', 'has-frame');
    board.classList.remove('waiting', 'wait-auto');

    const rawTitle = snap.title || ((snap.wind || '') + '風' + (snap.dealerWind || ''));
    const title = /局$/.test(rawTitle) ? rawTitle : rawTitle + '局';
    const setNo = snap.setIndex || 1;
    const ju = snap.handsPlayed || 0;
    const juNow = ju + (snap.status === 'settled' ? 0 : 1);
    if (live.hudTitle) live.hudTitle.textContent = title;
    if (live.hudSub) live.hudSub.textContent = '第 ' + juNow + ' 局 ・ 第 ' + setNo + ' 將';

    const players = snap.players || [];
    const scores = [];
    const hostSeat = hostSeatOfSnap(snap);
    for (let i = 0; i < 4; i++) {
      const p = players[i] || { name: '—', wind: '', score: 0, dealer: false, streak: 0, delta: 0, mo: 0, hu: 0, qiang: 0 };
      const sc = Math.round(+p.score || 0);
      scores[i] = sc;
      const card = live.byCorner && live.byCorner[cornerOfSeat(i, hostSeat)];
      if (!card) continue;
      const wind = p.wind || ((window.MJ && MJ.WINDS) ? MJ.WINDS[i] : ['東', '南', '西', '北'][i]);
      card.g.setAttribute('data-i', String(i));
      card.g.setAttribute('data-name', p.name || '—');
      card.g.setAttribute('data-wind', wind || '');
      card.g.setAttribute('data-score', String(sc));
      card.g.setAttribute('data-rev', String(snap.rev || ''));
      const nm = p.name || '—';
      if (L.setCardName) L.setCardName(card.name, nm);
      else {
        card.name.textContent = nm;
        card.name.setAttribute('font-size', String(nm.length > 3 ? TYPE.nameLong : TYPE.name));
      }
      if (card.wind) card.wind.textContent = wind ? (wind + '家') : '';
      const statsText = '摸 ' + (p.mo || 0) + '　胡 ' + (p.hu || 0) + '　槍 ' + (p.qiang || 0);
      if (L.setCardStats) L.setCardStats(card.stats, statsText);
      else card.stats.textContent = statsText;
      if (p.dealer) {
        setCardDealer(card, true);
        const streak = Number(p.streak) || 0;
        setCardLian(card, streak > 0 ? ('連' + streak + '拉' + streak) : '');
      } else {
        setCardDealer(card, false);
        setCardLian(card, '');
      }
      const showDelta = lastStamp && snap.updatedAt !== lastStamp && p.delta;
      if (showDelta) showDeltaFlyup(card, p.delta);
      const from = lastScores ? lastScores[i] : sc;
      animateScore(card.score, from, sc, i);
    }
    lastScores = scores;
    lastStamp = snap.updatedAt || Date.now();
    lastRenderKey = snapRenderKey(snap);
    raiseCornerCards();
    applyHandEvent(snap);
    raiseCornerCards();
  }

  window.__renderObs = render;
  window.__scoreFill = scoreFill;
  window.__obsRoom = room;
  window.__obsLayout = { CARD_W: CARD_W, CARD_H: CARD_H, CARD_POS: CARD_POS, TYPE: TYPE, HUD_SCALE: HUD_SCALE, noCssStageScale: true, native4k: true };

  if (autoMode) {
    if (!window.Sync) {
      if (waitEl) waitEl.innerHTML = '同步模組載入失敗';
      return;
    }
    bootLiveFlags();
    startAutoFollow();
    return;
  }
  if (!room) {
    showWaiting('noroom');
    bootLiveFlags();
    return;
  }
  if (!window.Sync) {
    if (waitEl) waitEl.innerHTML = '同步模組載入失敗';
    bootLiveFlags();
    return;
  }
  showWaiting('empty');
  unsubObs = Sync.subscribe(room, onObsSnap);
  bootLiveFlags();
})();

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && window.Sync && Sync.resume) {
      try { Sync.resume(); } catch (e) {}
    }
  });
  window.addEventListener('focus', function () {
    if (window.Sync && Sync.resume) try { Sync.resume(); } catch (e) {}
  });
  window.addEventListener('pageshow', function () {
    if (window.Sync && Sync.resume) try { Sync.resume(); } catch (e) {}
  });
  window.addEventListener('online', function () {
    if (window.Sync && Sync.resume) try { Sync.resume(); } catch (e) {}
  });
