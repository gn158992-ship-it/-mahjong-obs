/* OBS corner-card layout v2（繪珊・清楚好讀版）— authored in 3840×2160 design px at FINAL size.
   - CARD_W / CARD_H 是唯一共用尺寸：live overlay、胡牌動畫卡、星星終點都讀這裡。
     所有卡內文字位置都由 CARD_W / CARD_H 推出來，改這兩個數字就整組跟著變。
   - 白底、深色粗字；分數 正＝深綠、負＝深紅、0＝深灰。
   - 每張卡的「底圖」可以單獨換：CARD_BG[tl|tr|bl|br] + setCardBg()（純向量，無點陣、無 filter）。
   - 不畫 780×560 再縮放；不用 CSS scale / zoom。 */
(function (root) {
  const DESIGN_W = 3840;
  const DESIGN_H = 2160;

  /* 老爺：卡片維持 468×336。上排保留貓耳空間（PAD+CARD_EAR=58），耳朵用 v52.9 的原尺寸與形狀。
     繪珊 v2 字級依 560×384 設計；在 336 高的卡上按比例縮小，長名字／五位數由 fitText 再壓寬。 */
  const CARD_W = 468;
  const CARD_H = 336;
  const CARD_PAD = 16;
  const CARD_EAR = 42;
  const CARD_RX = 40;
  const CARD_BORDER = 8;      // 底圖外框粗細（顏色由底圖決定）
  const CARD_BAND = 22;       // 頂部色帶高度（座位識別色）
  const CARD_INSET = 30;      // 文字左右安全距
  const TEXT_MAX_W = CARD_W - CARD_INSET * 2;

  /* 顏色：白底對比（WCAG 相對亮度）
     姓名 18.4:1；摸胡槍 15.5:1；正分 7.0:1 以上、負分 8.0:1 以上、零分 13.0:1 以上。 */
  const COLORS = {
    ink: '#141414',
    stats: '#242424',
    pos: '#00632F',
    neg: '#A10016',
    zero: '#303030',
    dealer: '#D60000',
    dealerText: '#FFFFFF',
    lianBg: '#FFFFFF',
    lianText: '#D60000',
    lianEdge: '#D60000',
    tagEdge: '#FFFFFF',
  };
  function scoreFill(v) { v = +v || 0; return v > 0 ? COLORS.pos : v < 0 ? COLORS.neg : COLORS.zero; }
  function fmtScore(n) {
    n = Math.round(+n || 0);
    return (n > 0 ? '+' : n < 0 ? '\u2212' : '') + Math.abs(n);
  }

  /* 字級以 4K 向量座標計；長名字、大分數與多位數統計仍在原有安全寬度內縮放。 */
  const TYPE_SCALE = CARD_H / 384;
  const TYPE = {
    font: '"Noto Sans TC", "Noto Sans CJK TC", sans-serif',
    seat: 42,
    seatWeight: 800,
    wind: Math.round(54 * TYPE_SCALE),
    name: 94,
    nameLong: 94, // v2 不再用固定長名字級，改用 fitText
    nameMin: Math.round(64 * TYPE_SCALE),
    nameWeight: 900,
    score: 150,
    scoreMin: Math.round(120 * TYPE_SCALE),
    scoreWeight: 900,
    stats: 50,
    statsMin: 40,
    statsWeight: 800,
    statsFill: COLORS.stats,
    lian: Math.round(52 * TYPE_SCALE),
    lianWeight: 900,
    dealer: Math.round(64 * TYPE_SCALE),
    dealerWeight: 900,
    hudTitle: 96,
    hudTitleWeight: 900,
    hudSub: 72,
    hudSubWeight: 800,
    hudScale: 1,
  };

  /* 垂直排版（由 CARD_H 推）：色帶 → 名字 → 分數 → 統計。
     Noto Sans TC Black：CJK 墨水約在 baseline 上 0.88em、下 0.08em；數字墨水 0.73em、下 0。
     把分數放在名字底部與統計頂部的正中，使上下墨水留白均衡。 */
  const SCORE_INK_DESCENT = 0;
  const STATS_INK_ASCENT = Math.round(TYPE.stats * 0.84);
  const NAME_SCORE_GAP_MIN = 24;
  const SCORE_STATS_GAP_MIN = 24;
  const NAME_Y = Math.round(CARD_BAND + 16 + TYPE.name * 0.88);
  const STATS_Y = Math.round(CARD_H - 22);
  const SCORE_Y = (function () {
    const nameBottom = NAME_Y + TYPE.name * 0.08;
    const statsTop = STATS_Y - STATS_INK_ASCENT;
    const scoreAscent = TYPE.score * 0.73;
    const leftover = statsTop - nameBottom - scoreAscent;
    const gap = leftover / 2;
    return Math.round(nameBottom + gap + scoreAscent);
  })();

  /* 卡外標籤（莊 / 連N拉N）貼在卡片朝畫面中央的那一側。 */
  const TAG_GAP = 12;
  const TAG_Y = 20;
  const TAG_DEALER_W = 96;
  const TAG_DEALER_H = 84;
  const TAG_LIAN_H = 72;
  const TAG_STACK = 10;

  const TEXT = {
    cx: CARD_W / 2,
    seatY: 18,
    nameY: NAME_Y,
    lianY: NAME_Y + 48,
    scoreY: SCORE_Y,
    statsY: STATS_Y,
    maxW: TEXT_MAX_W,
    /* 胡牌動畫裡的「莊」：跟 live 一樣放卡外內側（obs-win 用 dealerPos(corner)）；dealerX/Y 留給舊碼 */
    dealerX: CARD_W - 2 * 34 - 16,
    dealerY: CARD_BAND + 8,
    dealerR: 34,
    popX: CARD_W + 182,
    popY: Math.round(CARD_H * 0.62),
    payPopInX: CARD_W + 24,
    payPopOutX: -12,
    payPopY: Math.round(CARD_H * 0.62),
    deltaX: CARD_W + 120,
    deltaY: Math.round(CARD_H * 0.72),   // 低於 莊＋連N拉N 兩顆標籤
  };

  function cornerPos(k) {
    const pad = CARD_PAD, w = CARD_W, h = CARD_H, ear = CARD_EAR;
    if (k === 'tl') return [pad, pad + ear];
    if (k === 'tr') return [DESIGN_W - pad - w, pad + ear];
    if (k === 'bl') return [pad, DESIGN_H - pad - h];
    return [DESIGN_W - pad - w, DESIGN_H - pad - h];
  }
  const CARD_POS = { tl: cornerPos('tl'), tr: cornerPos('tr'), bl: cornerPos('bl'), br: cornerPos('br') };
  function cardTransform(k) {
    const xy = CARD_POS[k];
    return 'translate(' + xy[0] + ',' + xy[1] + ')';
  }
  function isRight(corner) { return corner === 'tr' || corner === 'br'; }
  /* +N 飛字在卡外內側（朝畫面中央），右邊兩張鏡像。 */
  function winPopPos(corner) {
    return { x: isRight(corner) ? (CARD_W - TEXT.popX) : TEXT.popX, y: TEXT.popY };
  }
  function deltaPos(corner) {
    return { x: isRight(corner) ? (CARD_W - TEXT.deltaX) : TEXT.deltaX, y: TEXT.deltaY };
  }
  function tagSide(corner) { return isRight(corner) ? 'left' : 'right'; }
  function dealerPos(corner) {
    return { x: isRight(corner) ? (-TAG_GAP - TAG_DEALER_W) : (CARD_W + TAG_GAP), y: TAG_Y };
  }

  function fontAttrs(extra) {
    const a = { 'font-family': TYPE.font, 'text-rendering': 'geometricPrecision' };
    if (extra) { for (const k in extra) a[k] = extra[k]; }
    return a;
  }

  /* ---------- 文字自動縮放（不量 DOM：字型還沒載完也穩定） ----------
     Noto Sans TC Black 字寬（em）：CJK/全形 1.0、數字 0.60、+− 0.62、拉丁大寫 0.68、小寫 0.56、空白 0.25。 */
  function estWidthEm(s) {
    s = String(s == null ? '' : s);
    let w = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c >= 0x30 && c <= 0x39) w += 0.60;
      else if (ch === '×') w += 1.0;
      else if (ch === '+' || ch === '\u2212' || ch === '-') w += 0.62;
      else if (c >= 0x41 && c <= 0x5A) w += 0.68;
      else if (c >= 0x61 && c <= 0x7A) w += 0.56;
      else if (c === 0x20) w += 0.25;
      else if (c < 0x2E80) w += 0.62;
      else w += 1.0;
    }
    return w;
  }
  /* 先縮字級（不低於 min），還放不下才用 textLength 壓寬（向量，不模糊）。 */
  function fitText(node, text, size, min, maxW) {
    if (!node) return size;
    maxW = maxW || TEXT_MAX_W;
    const em = estWidthEm(text);
    let fs = size;
    if (em * fs > maxW) fs = Math.max(min, Math.floor(maxW / em));
    node.setAttribute('font-size', String(fs));
    if (em * fs > maxW) {
      node.setAttribute('textLength', String(maxW));
      node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    } else {
      node.removeAttribute('textLength');
      node.removeAttribute('lengthAdjust');
    }
    return fs;
  }
  function setCardName(node, name) {
    const nm = String(name == null || name === '' ? '—' : name);
    if (node.textContent !== nm) node.textContent = nm;
    fitText(node, nm, TYPE.name, TYPE.nameMin, TEXT_MAX_W);
  }
  function setCardStats(node, text) {
    if (!node || node.textContent === text) return;
    node.textContent = text;
    fitText(node, text, TYPE.stats, TYPE.statsMin, TEXT_MAX_W);
  }
  /* 分數：每格都可呼叫（只在字串長度改變時重算字級）。 */
  function setCardScore(node, v) {
    const s = fmtScore(v);
    if (node.textContent !== s) node.textContent = s;
    const f = scoreFill(v);
    if (node.getAttribute('fill') !== f) node.setAttribute('fill', f);
    const len = s.length;
    if (node.__fitLen !== len) {
      node.__fitLen = len;
      fitText(node, s, TYPE.score, TYPE.scoreMin, TEXT_MAX_W);
    }
  }

  /* ---------- 每張卡的底圖（可單獨換） ----------
     spec 可以是：
       1) 預設名稱字串：'white' | 'host' | 'pink' | 'sky' | 'lilac' | 'mint' | 'gold'
       2) 物件 { face, edge, band, shadow }（face 必須是淺色，字才清楚；建議 #FFFFFF）
       3) 函式 function (el, slot, ctx) { ... }  — 自訂向量底圖，ctx = { w, h, rx, corner, band }
          注意：只能畫向量（path/rect/text…），不可 <image>、filter、blur；文字區保持淺色。 */
  const BG_PRESETS = {
    white: { face: '#FFFFFF', edge: '#FFFFFF', band: '#E6E6E6', shadow: 0.30 },
    pink:  { face: '#FFFFFF', edge: '#FF6F8E', band: '#FF6F8E', shadow: 0.30 },
    sky:   { face: '#FFFFFF', edge: '#3E9BDB', band: '#3E9BDB', shadow: 0.30 },
    lilac: { face: '#FFFFFF', edge: '#8F78D6', band: '#8F78D6', shadow: 0.30 },
    mint:  { face: '#FFFFFF', edge: '#2FB6A3', band: '#2FB6A3', shadow: 0.30 },
    gold:  { face: '#FFFFFF', edge: '#F2B200', band: '#F2B200', shadow: 0.30 },
    /* 坤哥（右下）主視覺：金框加粗＋金色帶 */
    host:  { face: '#FFFFFF', edge: '#F2B200', band: '#F2B200', shadow: 0.34, edgeW: 12 },
  };
  const CARD_BG = { tl: 'pink', tr: 'sky', bl: 'lilac', br: 'host' };

  /* URL 覆寫：obs.html?cardbg=tl:white,tr:gold  （iframe 會讀上一層的設定，見 bgSpecFor） */
  try {
    if (root.location && root.URLSearchParams) {
      const q = new URLSearchParams(root.location.search).get('cardbg');
      if (q) q.split(',').forEach(function (kv) {
        const p = kv.split(':');
        if (p.length === 2 && CARD_BG.hasOwnProperty(p[0]) && BG_PRESETS[p[1]]) CARD_BG[p[0]] = p[1];
      });
    }
  } catch (e) {}

  function bgSpecFor(corner) {
    /* obs-win.html 是同源 iframe：優先用上一層 obs.html 的設定，兩邊永遠一致 */
    try {
      if (root.parent && root.parent !== root && root.parent.OBS_LAYOUT && root.parent.OBS_LAYOUT.CARD_BG) {
        const s = root.parent.OBS_LAYOUT.CARD_BG[corner];
        if (s != null) return s;
      }
    } catch (e) {}
    return CARD_BG[corner];
  }
  function resolveBg(spec) {
    if (typeof spec === 'function') return spec;
    if (typeof spec === 'string') return BG_PRESETS[spec] || BG_PRESETS.white;
    if (spec && typeof spec === 'object') {
      const o = {};
      const base = BG_PRESETS.white;
      for (const k in base) o[k] = base[k];
      for (const k in spec) o[k] = spec[k];
      return o;
    }
    return BG_PRESETS.white;
  }
  function paintBgInto(el, slot, corner, spec) {
    while (slot.firstChild) slot.removeChild(slot.firstChild);
    const s = resolveBg(spec);
    const w = CARD_W, h = CARD_H, rx = CARD_RX;
    if (typeof s === 'function') {
      s(el, slot, { w: w, h: h, rx: rx, corner: corner, band: CARD_BAND, colors: COLORS });
      return;
    }
    const ew = s.edgeW || CARD_BORDER;
    /* 貓耳：v52.9 原路徑（尖端 y=-42），先畫再蓋卡身。外耳跟邊框色，內耳保持原色 #FFE3EA。 */
    el('path', {
      class: 'card-ears',
      d: 'M66 6 L102 -42 L144 6 Z M402 6 L366 -42 L324 6 Z',
      fill: s.edge || s.band || '#FFFFFF',
      stroke: '#fff',
      'stroke-width': 6,
      'stroke-linejoin': 'round'
    }, slot);
    el('path', {
      class: 'card-ears-inner',
      d: 'M90 0 L103.2 -24 L123 0Z M378 0 L364.8 -24 L345 0Z',
      fill: '#FFE3EA'
    }, slot);
    /* 硬陰影（不模糊）：讓白卡在亮色畫面上也有邊界 */
    if (s.shadow) el('rect', { x: 0, y: 10, width: w, height: h, rx: rx, fill: '#000000', opacity: String(s.shadow) }, slot);
    el('rect', { class: 'card-face', x: 0, y: 0, width: w, height: h, rx: rx, fill: s.face }, slot);
    if (s.band) {
      /* 頂部色帶：上圓角、下直角 */
      const b = CARD_BAND + ew / 2;
      el('path', {
        class: 'card-band',
        d: 'M0 ' + rx + ' A' + rx + ' ' + rx + ' 0 0 1 ' + rx + ' 0 H' + (w - rx) + ' A' + rx + ' ' + rx + ' 0 0 1 ' + w + ' ' + rx +
           ' V' + b + ' H0 Z',
        fill: s.band,
      }, slot);
    }
    el('rect', { class: 'card-edge', x: ew / 2, y: ew / 2, width: w - ew, height: h - ew, rx: rx - ew / 2, fill: 'none', stroke: s.edge, 'stroke-width': ew }, slot);
  }

  /* 已建立的底圖插槽（live 與 win 各自 document），setCardBg 會即時重畫。 */
  const slots = [];
  function registerSlot(el, slot, corner) {
    slots.push({ el: el, slot: slot, corner: corner });
  }
  function setCardBg(corner, spec) {
    if (!CARD_BG.hasOwnProperty(corner)) return false;
    CARD_BG[corner] = spec;
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      if (!s.slot.isConnected) { slots.splice(i, 1); continue; }
      if (s.corner === corner) paintBgInto(s.el, s.slot, corner, spec);
    }
    /* 同步到胡牌動畫 iframe（同源） */
    try {
      const fr = root.document && root.document.querySelectorAll ? root.document.querySelectorAll('iframe') : [];
      for (let j = 0; j < fr.length; j++) {
        const w = fr[j].contentWindow;
        if (w && w.OBS_LAYOUT && w.OBS_LAYOUT !== layout && w.OBS_LAYOUT.repaintAllBg) w.OBS_LAYOUT.repaintAllBg();
      }
    } catch (e) {}
    return true;
  }
  function repaintAllBg() {
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      if (!s.slot.isConnected) { slots.splice(i, 1); continue; }
      paintBgInto(s.el, s.slot, s.corner, bgSpecFor(s.corner));
    }
  }
  function getCardBg(corner) { return bgSpecFor(corner); }

  /* el(tag, attrs, parent) matches obs.js / obs-win.html. All coords are final 4K px.
     v2：paintShell(el, parent, color, corner)。color 被忽略（底圖由 CARD_BG 決定）。
     為相容舊 obs-win 的 setShellColor（改 children[0] / [2] 的 fill），前兩個位置放空 <g>。 */
  function paintShell(el, parent, color, corner) {
    const shell = el('g', { class: 'card-shell', 'data-shell': 'v2' }, parent);
    if (!corner) {
      let p = parent;
      while (p && p.getAttribute && !p.getAttribute('data-corner')) p = p.parentNode;
      corner = (p && p.getAttribute && p.getAttribute('data-corner')) || 'tl';
    }
    shell.setAttribute('data-corner-bg', corner);
    el('g', { class: 'legacy-slot' }, shell);                 // children[0]
    const slot = el('g', { class: 'card-bg' }, shell);       // children[1]
    el('g', { class: 'legacy-slot' }, shell);                 // children[2]
    paintBgInto(el, slot, corner, bgSpecFor(corner));
    registerSlot(el, slot, corner);
    shell.__bgSlot = slot;
    return shell;
  }

  /* ---------- live 卡片元件：回傳 obs.js 原本 live.byCorner[k] 的同一組欄位 ---------- */
  function buildCard(el, parent, k) {
    const g = el('g', { class: 'card', 'data-corner': k, 'data-w': String(CARD_W), 'data-h': String(CARD_H), transform: cardTransform(k) }, parent);
    const shell = paintShell(el, g, null, k);
    const wind = el('text', fontAttrs({ class: 'card-wind', x: TEXT.cx, y: TEXT.seatY, 'text-anchor': 'middle', 'font-size': (TYPE.wind || TYPE.stats || 28), 'font-weight': 700, fill: COLORS.stats || '#6B5A48' }), g, '');
    const name = el('text', fontAttrs({ class: 'card-name', x: TEXT.cx, y: TEXT.nameY, 'text-anchor': 'middle', 'font-size': TYPE.name, 'font-weight': TYPE.nameWeight, fill: COLORS.ink }), g, '');
    const score = el('text', fontAttrs({ class: 'card-score', x: TEXT.cx, y: TEXT.scoreY, 'text-anchor': 'middle', 'font-size': TYPE.score, 'font-weight': TYPE.scoreWeight, fill: COLORS.zero, 'font-variant-numeric': 'tabular-nums' }), g, '0');
    const stats = el('text', fontAttrs({ class: 'card-stats', x: TEXT.cx, y: TEXT.statsY, 'text-anchor': 'middle', 'font-size': TYPE.stats, 'font-weight': TYPE.statsWeight, fill: COLORS.stats }), g, '摸 0　胡 0　槍 0');
    const dealer = el('g', { class: 'card-dealer-tag', display: 'none' }, g);
    const dealerBg = el('rect', { class: 'card-dealer-bg', x: 0, y: 0, width: String(TAG_DEALER_W), height: String(TAG_DEALER_H), rx: 16, fill: COLORS.dealer, stroke: COLORS.tagEdge, 'stroke-width': 5 }, dealer);
    const dealerLabel = el('text', fontAttrs({ x: String(TAG_DEALER_W / 2), y: String(TAG_DEALER_H * 0.74), 'text-anchor': 'middle', 'font-size': TYPE.dealer, 'font-weight': TYPE.dealerWeight, fill: COLORS.dealerText }), dealer, '莊');
    const lianG = el('g', { class: 'card-lian', opacity: '0', display: 'none' }, g);
    const lianBg = el('rect', { class: 'card-lian-bg', fill: COLORS.lianBg, stroke: COLORS.lianEdge, 'stroke-width': 5, x: 0, y: 0, width: 0, height: String(TAG_LIAN_H), rx: 16 }, lianG);
    const lian = el('text', fontAttrs({ class: 'card-lian-label', x: 0, y: 0, 'text-anchor': 'middle', 'font-size': TYPE.lian, 'font-weight': TYPE.lianWeight, fill: COLORS.lianText }), lianG, '');
    return { g: g, corner: k, shell: shell, bgSlot: shell.__bgSlot, wind: wind, name: name, score: score, stats: stats, dealer: dealer, dealerBg: dealerBg, dealerLabel: dealerLabel, lian: lian, lianG: lianG, lianBg: lianBg, delta: null };
  }

  /* Paw motif in final 4K pixels (no leftover 780-space scale). */
  function paintPaw(el, parent, x, y, fill) {
    const g = el('g', { fill: fill, transform: 'translate(' + x + ',' + y + ')' }, parent);
    el('ellipse', { cx: 0, cy: 9.36, rx: 17.16, ry: 14.04 }, g);
    [[-17.16, -10.92], [-6.24, -20.28], [6.24, -20.28], [17.16, -10.92]].forEach(function (p) {
      el('circle', { cx: p[0], cy: p[1], r: 7.02 }, g);
    });
    return g;
  }
  function mimiArt() {
    if (typeof window !== 'undefined' && window.MIMI_ART) return window.MIMI_ART;
    if (typeof globalThis !== 'undefined' && globalThis.MIMI_ART) return globalThis.MIMI_ART;
    return null;
  }
  /* 繪珊 4K 向量咪姬：頂部局數條用徽章，結算牌旁用拿「中」牌。無點陣、無 filter。 */
  function ensureMimiSymbol(el, defs) {
    return ensureMimiSymbols(el, defs);
  }
  function ensureMimiSymbols(el, defs) {
    if (!defs) return null;
    const Art = mimiArt();
    if (!Art || !Art.build) return null;
    if (!defs.querySelector || !defs.querySelector('#mimi-badge')) {
      const b = Art.build('bust', 'mb_');
      const g = el('symbol', { id: 'mimi-badge', viewBox: '0 0 600 600' }, defs);
      g.innerHTML = b.defs +
        '<clipPath id="mb_disc"><circle cx="300" cy="300" r="284"/></clipPath>' +
        '<circle cx="300" cy="300" r="292" fill="#FFFFFF"/>' +
        '<circle cx="300" cy="300" r="280" fill="#FFF3F5"/>' +
        '<circle cx="300" cy="300" r="280" fill="none" stroke="#FFB7C5" stroke-width="14"/>' +
        '<g clip-path="url(#mb_disc)"><g transform="translate(0 72)">' + b.cut + b.art + '</g></g>' +
        '<circle cx="300" cy="300" r="286" fill="none" stroke="#FFFFFF" stroke-width="10"/>';
    }
    if (!defs.querySelector('#mimi-plaque')) {
      const t = Art.build('tile', 'mp_');
      const g = el('symbol', { id: 'mimi-plaque', viewBox: '50 0 590 760' }, defs);
      g.innerHTML = t.defs + t.shadow + t.cut + t.art;
    }
    return defs.querySelector('#mimi-badge');
  }
  function paintMimi(el, parent, cx, cy, size, kind) {
    const svg = parent && parent.ownerSVGElement ? parent.ownerSVGElement : (parent && parent.tagName === 'svg' ? parent : null);
    let defs = svg && svg.querySelector ? svg.querySelector('defs') : null;
    if (svg && !defs) defs = el('defs', {}, svg);
    ensureMimiSymbols(el, defs);
    const plaque = kind === 'plaque' || kind === 'tile';
    const id = plaque ? 'mimi-plaque' : 'mimi-badge';
    size = size || 180;
    const w = plaque ? size * (590 / 760) : size;
    const h = size;
    const href = '#' + id;
    if (!defs || !defs.querySelector(href)) return null;
    return el('use', {
      href: href,
      x: (cx - w / 2),
      y: (cy - h / 2),
      width: w,
      height: h
    }, parent);
  }


  const layout = {
    VERSION: 'cards-v2',
    DESIGN_W: DESIGN_W,
    DESIGN_H: DESIGN_H,
    CARD_W: CARD_W,
    CARD_H: CARD_H,
    CARD_PAD: CARD_PAD,
    CARD_EAR: CARD_EAR,
    CARD_RX: CARD_RX,
    CARD_BAND: CARD_BAND,
    CARD_INSET: CARD_INSET,
    COLORS: COLORS,
    TYPE: TYPE,
    TEXT: TEXT,
    SCORE_INK_DESCENT: SCORE_INK_DESCENT,
    STATS_INK_ASCENT: STATS_INK_ASCENT,
    NAME_SCORE_GAP_MIN: NAME_SCORE_GAP_MIN,
    SCORE_STATS_GAP_MIN: SCORE_STATS_GAP_MIN,
    TAG_GAP: TAG_GAP,
    TAG_Y: TAG_Y,
    TAG_DEALER_W: TAG_DEALER_W,
    TAG_DEALER_H: TAG_DEALER_H,
    TAG_LIAN_H: TAG_LIAN_H,
    TAG_STACK: TAG_STACK,
    CARD_POS: CARD_POS,
    BG_PRESETS: BG_PRESETS,
    CARD_BG: CARD_BG,
    cornerPos: cornerPos,
    cardTransform: cardTransform,
    winPopPos: winPopPos,
    deltaPos: deltaPos,
    dealerPos: dealerPos,
    tagSide: tagSide,
    fontAttrs: fontAttrs,
    scoreFill: scoreFill,
    fmtScore: fmtScore,
    estWidthEm: estWidthEm,
    fitText: fitText,
    setCardName: setCardName,
    setCardScore: setCardScore,
    setCardStats: setCardStats,
    paintShell: paintShell,
    buildCard: buildCard,
    setCardBg: setCardBg,
    getCardBg: getCardBg,
    repaintAllBg: repaintAllBg,
    paintPaw: paintPaw,
    paintMimi: paintMimi,
    ensureMimiSymbol: ensureMimiSymbol,
    ensureMimiSymbols: ensureMimiSymbols,
  };
  root.OBS_LAYOUT = layout;
  if (typeof module !== 'undefined' && module.exports) module.exports = layout;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
