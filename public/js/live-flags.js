/* s10c 直播保險：OBS／觀戰輪詢 GET /api/flags，房主開關走 POST。 */
(function (root) {
  'use strict';
  var KEYS = ['obsOverlay', 'winAnim', 'spectator'];
  var state = { obsOverlay: true, winAnim: true, spectator: true, v: 0 };
  var knownV = null;
  var listeners = [];
  var timer = null;
  var inflight = null;
  var inflightAc = null;
  var room = '';
  var wanted = false;
  var paused = false;
  var delay = 2000;
  var gen = 0;

  function isOff(v) {
    return v === false || v === 'false' || v === 0 || v === '0';
  }

  function parseFlags(data) {
    if (!data || typeof data !== 'object') return null;
    var src = {};
    if (data.flags && typeof data.flags === 'object') {
      Object.keys(data.flags).forEach(function (k) { src[k] = data.flags[k]; });
    }
    Object.keys(data).forEach(function (k) {
      if (k !== 'flags') src[k] = data[k];
    });
    var out = {};
    KEYS.forEach(function (k) {
      out[k] = isOff(src[k]) ? false : true;
    });
    var v = Number(src.v);
    out.v = Number.isFinite(v) ? v : 0;
    return out;
  }

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) {}
    });
  }

  function applyIfChanged(next, force) {
    if (!next) return state;
    /* v 跟上次不同就更新（含變小：flags.json 損壞或被重寫時）。 */
    if (!force && knownV != null && next.v === knownV) return state;
    state = next;
    knownV = next.v;
    notify();
    return state;
  }

  function flagsUrl(forRoom) {
    var u = '/api/flags';
    if (forRoom) u += '?room=' + encodeURIComponent(forRoom);
    return u;
  }

  function currentRoom() {
    if (room) return room;
    try {
      if (root.__obsRoom) return String(root.__obsRoom || '');
    } catch (e) {}
    try {
      var q = new URLSearchParams(location.search);
      var r = String(q.get('room') || q.get('watch') || '').trim();
      if (r && !/^(auto|latest)$/i.test(r)) return r;
    } catch (e3) {}
    return '';
  }

  function abortCtrl(ac, reason) {
    if (!ac) return;
    try { ac.abort(reason); } catch (e) {
      try { ac.abort(); } catch (e2) {}
    }
  }

  function abortReasonOf(ac) {
    try {
      if (ac && ac.signal && ac.signal.reason != null) return ac.signal.reason;
    } catch (e) {}
    return '';
  }

  function abortInflight(why) {
    if (inflightAc) abortCtrl(inflightAc, why || 'cancel');
    inflightAc = null;
    inflight = null;
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(ms) {
    clearTimer();
    if (!wanted || !room) return;
    timer = setTimeout(function () {
      timer = null;
      pollOnce();
    }, ms);
  }

  function stale(reqRoom, reqGen) {
    return reqRoom !== room || reqGen !== gen;
  }

  function pollOnce() {
    if (!room) return Promise.resolve(state);
    if (inflight) return inflight;
    var reqRoom = room;
    var reqGen = gen;
    var ac = new AbortController();
    inflightAc = ac;
    var failed = false;
    var timedOut = false;
    var to = setTimeout(function () {
      timedOut = true;
      abortCtrl(ac, 'timeout');
    }, 1500);
    inflight = fetch(flagsUrl(reqRoom), { cache: 'no-store', credentials: 'same-origin', signal: ac.signal })
      .then(function (r) {
        if (stale(reqRoom, reqGen)) throw { _stale: true };
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then(function (data) {
        if (stale(reqRoom, reqGen)) return state;
        var next = parseFlags(data);
        if (!next) throw new Error('bad json');
        applyIfChanged(next);
        delay = 2000;
        return state;
      })
      .catch(function (err) {
        /* 換房／stop／hidden 造成的主動取消不算失敗；自己的逾時要退避。 */
        if (stale(reqRoom, reqGen) || (err && err._stale)) return state;
        var reason = abortReasonOf(ac);
        var isTimeout = timedOut || reason === 'timeout';
        if (!isTimeout && err && err.name === 'AbortError') return state;
        failed = true;
        return state;
      })
      .then(function (s) {
        clearTimeout(to);
        if (inflightAc === ac) {
          inflightAc = null;
          inflight = null;
        }
        if (wanted && !paused && !stale(reqRoom, reqGen)) {
          schedule(delay);
          if (failed) delay = Math.min(delay * 2, 10000);
        }
        return s;
      });
    return inflight;
  }

  function start(opts) {
    opts = opts || {};
    if (opts.room != null) setRoom(opts.room, { silent: true });
    else if (!room) {
      var guessed = currentRoom();
      if (guessed) room = guessed;
    }
    wanted = true;
    paused = false;
    if (!room) return; /* 沒房號不輪詢 */
    delay = 2000;
    pollOnce();
  }

  function stop() {
    wanted = false;
    paused = false;
    clearTimer();
    abortInflight('stop');
    gen += 1;
  }

  function setRoom(r, opts) {
    r = r == null ? '' : String(r);
    if (r === room) return;
    room = r;
    knownV = null;
    gen += 1;
    abortInflight('room-change');
    if (!room) {
      clearTimer();
      return;
    }
    if (wanted && !(opts && opts.silent) && !paused) {
      delay = 2000;
      pollOnce();
    }
  }

  function get() { return state; }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function postFlag(key, value) {
    if (KEYS.indexOf(key) < 0) return Promise.reject(new Error('bad key'));
    var r = room || currentRoom();
    var reqGen = gen;
    var secret = '';
    try {
      if (root.Sync && typeof Sync.getSecret === 'function') secret = Sync.getSecret(r) || '';
    } catch (e) {}
    var body = { room: r, flags: {} };
    body.flags[key] = !!value;
    var headers = { 'content-type': 'application/json' };
    if (secret) headers['X-Room-Secret'] = secret;
    var ac = new AbortController();
    var to = setTimeout(function () { try { ac.abort(); } catch (e) {} }, 1500);
    return fetch('/api/flags', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: headers,
      body: JSON.stringify(body),
      signal: ac.signal
    }).then(function (res) {
      clearTimeout(to);
      if (res.status === 403) {
        var err = new Error('forbidden');
        err.code = 403;
        throw err;
      }
      if (!res.ok) throw new Error('bad status');
      return res.json();
    }).then(function (data) {
      if (stale(r, reqGen)) return state;
      var next = parseFlags(data);
      if (!next) throw new Error('bad json');
      applyIfChanged(next, true);
      delay = 2000;
      return state;
    }).catch(function (err) {
      clearTimeout(to);
      throw err;
    });
  }

  function pause() {
    paused = true;
    clearTimer();
    abortInflight('pause');
  }

  function resume() {
    if (!wanted) return;
    try {
      if (document.visibilityState === 'hidden') return;
    } catch (e) {}
    paused = false;
    delay = 2000;
    if (room) pollOnce();
  }

  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') pause();
      else resume();
    });
    root.addEventListener('pagehide', pause);
    root.addEventListener('pageshow', resume);
  } catch (e) {}

  root.LiveFlags = {
    start: start,
    stop: stop,
    setRoom: setRoom,
    get: get,
    onChange: onChange,
    pollOnce: pollOnce,
    postFlag: postFlag,
    parseFlags: parseFlags,
    keys: KEYS,
    getRoom: function () { return room; },
    isWanted: function () { return wanted; },
    pollDelay: function () { return delay; }
  };
})(window);
