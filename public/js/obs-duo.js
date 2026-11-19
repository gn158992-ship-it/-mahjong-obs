/* v53.15：OBS 名稱槽。由 obs.js / obs-win.html 呼叫 mountObsDuo(cfg)。
   同一個 DOM 影片放在父頁、蓋在胡牌 iframe 之上，播動畫時不會重開或跳格。
   若 obs-win.html 單獨打開（沒有父頁名稱槽），才自己掛一份。 */
(function (root) {
  'use strict';
  var DESIGN_W = 3840, DESIGN_H = 2160;
  var mountGen = 0;

  /* standalone：本頁自己掛名稱槽。
     parent-slot / same-origin：父頁已有（或即將有）同一顆影片，這裡不要再掛第二顆。
     cross-origin：讀不到父頁 currentTime，只顯示後備文字／海報，不另開影片，以免重播跳格。 */
  function parentSituation() {
    if (!root.parent || root.parent === root) return 'standalone';
    try {
      var doc = root.parent.document;
      if (doc && doc.getElementById('duo-slot')) return 'parent-slot';
      if (doc) return 'same-origin';
    } catch (e) {
      return 'cross-origin';
    }
    return 'standalone';
  }

  function splitLabel(s) {
    s = String(s == null ? '' : s);
    var ix = s.indexOf('\u00D7');
    if (ix < 0) return { left: s, mid: '', right: '' };
    return { left: s.slice(0, ix), mid: '\u00D7', right: s.slice(ix + 1) };
  }

  function fit(space, layer) {
    if (!space || !layer) return 1;
    var s = Math.min((layer.clientWidth || 0) / DESIGN_W, (layer.clientHeight || 0) / DESIGN_H);
    if (!(s > 0)) s = 1;
    space.style.transform = 'scale(' + s + ')';
    return s;
  }

  function applyLayout(cfg, divider, slot) {
    var hudW = cfg.hudW || 1160;
    var hudH = cfg.hudH || 220;
    var hudY = cfg.hudY == null ? 16 : cfg.hudY;
    var gap = cfg.gap == null ? 24 : cfg.gap;
    var dGap = cfg.dividerGap == null ? 24 : cfg.dividerGap;
    var h = cfg.h || hudH;
    var aspect = cfg.aspect || 3;
    var w = Math.round(h * aspect);
    var hudX = (DESIGN_W - hudW) / 2;
    var hudRight = hudX + hudW;
    var divX = hudRight + gap;
    var divH = Math.round(96 * 0.7);
    var divY = hudY + (hudH - divH) / 2;
    var slotX = divX + 1 + dGap;
    var slotY = hudY;
    divider.style.left = divX + 'px';
    divider.style.top = divY + 'px';
    divider.style.height = divH + 'px';
    slot.style.left = slotX + 'px';
    slot.style.top = slotY + 'px';
    slot.style.width = w + 'px';
    slot.style.height = h + 'px';
    return { x: slotX, y: slotY, w: w, h: h, dividerX: divX, hudRight: hudRight, hudY: hudY };
  }

  function fillFallback(el, label) {
    var p = splitLabel(label);
    el.innerHTML = '';
    if (p.mid) {
      var a = document.createElement('span'); a.textContent = p.left;
      var x = document.createElement('span'); x.className = 'x'; x.textContent = p.mid;
      var b = document.createElement('span'); b.textContent = p.right;
      el.appendChild(a); el.appendChild(x); el.appendChild(b);
    } else {
      var t = document.createElement('span'); t.textContent = p.left;
      el.appendChild(t);
    }
    el.setAttribute('data-host-label', '1');
  }

  function mount(cfg) {
    /* v53.16 s5：名稱槽整行拿掉，不建立 duo-layer / 後備文字 / 短片。 */
    root.__OBS_DUO = { skipped: true, reason: 'disabled' };
    try { root.__OBS_HOST_LABEL = ''; } catch (e) {}
    return root.__OBS_DUO;
    cfg = cfg || {};
    var sit = parentSituation();
    if (sit === 'parent-slot' || sit === 'same-origin') {
      root.__OBS_DUO = { parented: true, skipped: true, reason: sit };
      return root.__OBS_DUO;
    }
    if (sit === 'cross-origin') {
      cfg = Object.assign({}, cfg, { src: '' });
    }
    var layer = document.getElementById('duo-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'duo-layer';
      var host = document.getElementById('stage');
      if (host && host.tagName === 'DIV') host.appendChild(layer);
      else (document.body || document.documentElement).appendChild(layer);
    }
    layer.setAttribute('aria-hidden', 'false');
    var space = document.getElementById('duo-space');
    if (!space) {
      space = document.createElement('div');
      space.id = 'duo-space';
      layer.appendChild(space);
    }
    var divider = document.getElementById('duo-divider');
    if (!divider) {
      divider = document.createElement('span');
      divider.id = 'duo-divider';
      divider.className = 'duo-divider';
      space.appendChild(divider);
    }
    var slot = document.getElementById('duo-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'duo-slot';
      slot.className = 'duo-slot';
      space.appendChild(slot);
    }
    var video = slot.querySelector('video.duo-clip') || document.getElementById('duo-clip');
    if (!video) {
      video = document.createElement('video');
      video.id = 'duo-clip';
      video.className = 'duo-clip';
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('autoplay', '');
      video.setAttribute('loop', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      slot.appendChild(video);
    }
    var duo = slot.querySelector('.duo');
    if (!duo) {
      duo = document.createElement('span');
      duo.className = 'duo';
      slot.appendChild(duo);
    }
    var label = cfg.label || '老爺 × 咪姬';
    fillFallback(duo, label);
    var layout = applyLayout(cfg, divider, slot);
    function doFit() { fit(space, layer); }
    doFit();
    if (root.ResizeObserver) {
      if (layer._duoRo) layer._duoRo.disconnect();
      layer._duoRo = new ResizeObserver(doFit);
      layer._duoRo.observe(layer);
    } else {
      root.addEventListener('resize', doFit);
    }

    function showClip(on) {
      if (on) slot.classList.add('has-clip');
      else slot.classList.remove('has-clip');
    }

    var src = cfg.src == null ? 'assets/duo.webm' : String(cfg.src);
    var my = ++mountGen;
    showClip(false);
    if (src) {
      video.muted = true;
      video.setAttribute('src', src);
      video.src = src;
      var onOk = function () {
        if (my !== mountGen) return;
        showClip(true);
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      };
      var onErr = function () {
        if (my !== mountGen) return;
        showClip(false);
      };
      video.addEventListener('loadeddata', onOk);
      video.addEventListener('canplay', onOk);
      video.addEventListener('error', onErr);
      if (video.readyState >= 2) onOk();
    }

    var info = {
      parented: sit === 'cross-origin',
      skipped: false,
      reason: sit,
      src: src,
      label: label,
      layout: layout,
      video: video,
      slot: slot,
    };
    root.__OBS_DUO = info;
    try { root.__OBS_HOST_LABEL = label; } catch (e) {}
    return info;
  }

  root.mountObsDuo = mount;
})(window);
