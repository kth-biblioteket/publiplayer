'use strict';
// Kör: node tests/rotator.test.js
// Kör den riktiga js/rotator.js med virtuell klocka. Kontrollerar att
//  1. varje sida visas sin inställda tid (utan rättelsen i scheduleNext visades sidor 18 och 22 s i stället för 13 och 11 s),
//  2. bara den aktiva ramen ritas,
//  3. alla filmer spelas i spelarens egen <video id="film">, aldrig i ramar och aldrig två samtidigt (skärmen har en enda
//     filmavkodare: flera videor ger frysning, dubbla bilder och skräp; mätt på QH55R), att en film inte förladdas, och att
//     skärmen tonas ut före och in efter ett filmbyte.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const sched = require(path.join(root, 'js/schedule.js'));
const source = fs.readFileSync(path.join(root, 'js/rotator.js'), 'utf8');

/** pagesSpec: "url|sekunder\n...", loadSeconds: laddtid per sida i ordning. */
async function run(pagesSpec, total, loadSeconds, failFirst) {
  let now = 0, seq = 0;
  const timers = new Map();
  const RealDate = Date;
  const base = new RealDate('2026-10-21T10:00:00').getTime();
  function VDate(a) { return a === undefined ? new RealDate(base + now) : new RealDate(a); }
  VDate.now = () => base + now;
  VDate.prototype = RealDate.prototype;
  const setTimeoutV = (fn, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn, id }); return id; };
  const clearTimeoutV = (id) => { timers.delete(id); };

  const swaps = [], els = [], fades = [], changes = [], filmLog = [], frameFilms = [], violations = [], fetched = {};
  const pages = sched.parsePages(pagesSpec, 30, null);
  const delayOf = (url) => (loadSeconds[pages.findIndex((p) => p.url === url)] || 0.3) * 1000;
  const isFilm = (url) => /film/.test(url || '');

  // spelarens <video id="film">: första bilden ca 0,55 s efter att källan satts
  const film = (() => {
    const v = { style: {}, muted: false, loop: false, paused: true, error: null, _src: '', _t0: 0 };
    Object.defineProperty(v, 'currentTime', { get() { return v._src ? Math.max(0, (now - v._t0) / 1000) : 0; } });
    Object.defineProperty(v, 'currentSrc', { get() { return v._src; } });
    Object.defineProperty(v, 'src', { set(x) { v._src = x; v._t0 = now + 550; filmLog.push({ t: now / 1000, src: x }); if (els.some((e) => e.filmLoaded && e.style.visibility !== 'hidden')) violations.push(now / 1000); }, get() { return v._src; } });
    v.play = () => { v.paused = false; return Promise.resolve(); };
    v.pause = () => { v.paused = true; };
    v.removeAttribute = (k) => { if (k === 'src') { v._src = ''; filmLog.push({ t: now / 1000, src: null }); } };
    v.load = () => {};
    return v;
  })();

  function mkEl(id) {
    const attrs = {}, listeners = {};
    const el = {
      id, style: {}, filmLoaded: false,
      addEventListener(ev, fn) { listeners[ev] = fn; },
      setAttribute(k, v) { attrs[k] = v; },
      removeAttribute(k) { delete attrs[k]; },
      getAttribute(k) { return attrs[k] === undefined ? null : attrs[k]; },
      set src(v) {
        attrs.src = v; el.filmLoaded = false;
        if (v === 'about:blank') return;
        if (isFilm(v)) frameFilms.push({ t: now / 1000, url: v });
        setTimeoutV(() => { el.filmLoaded = isFilm(v); listeners.load && listeners.load(); }, delayOf(v));
      },
      get src() { return attrs.src; },
      get contentDocument() { return { querySelector: () => (el.filmLoaded ? { paused: false, ended: false } : null) }; },
      contentWindow: { postMessage() {} },
    };
    return el;
  }

  const sandbox = {
    setTimeout: setTimeoutV, clearTimeout: clearTimeoutV, Date: VDate, Promise, navigator: { onLine: true }, console, URL,
    fetch: (url) => (failFirst && !fetched[url] && (fetched[url] = 1)) ? Promise.reject(new Error('nät')) : Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(isFilm(url) ? '<body><video src="../f/' + url.split('/').pop() + '.mp4" autoplay muted loop></video>' : '<img src="x.jpg">'),
    }),
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  vm.createContext(sandbox);
  sandbox.PP = { schedule: sched };
  vm.runInContext(source, sandbox);
  const proto = sandbox.PP.Rotator.prototype, raise = proto.raise, scheduleNext = proto.scheduleNext;
  let lastIndex = 0;
  proto.raise = function () { raise.call(this); if (now > 0) swaps.push({ t: now / 1000, id: els[this.active].id, vis: els.map((e) => e.style.visibility) }); };
  proto.scheduleNext = function () {
    if (now > 0 && this.index !== lastIndex) { changes.push({ t: now / 1000, index: this.index }); lastIndex = this.index; }
    return scheduleNext.call(this);
  };

  els.push(mkEl('frame-a'), mkEl('frame-b'));
  const r = new sandbox.PP.Rotator(els[0], els[1], { error() {}, black() {}, fade(on) { fades.push({ t: now / 1000, on }); } }, film);
  r.configure({ defaultList: pages, schedule: null, scripts: true, onLoaded() {} });

  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  r.start();
  await flush();
  while (now <= total * 1000) {
    let next = null;
    for (const t of timers.values()) if (!next || t.at < next.at || (t.at === next.at && t.id < next.id)) next = t;
    if (!next) break;
    now = next.at; timers.delete(next.id);
    next.fn();
    await flush();
  }
  let prev = 0;
  const shown = swaps.map((s) => { const d = s.t - prev; prev = s.t; return d; });
  return { swaps, shown, fades, changes, filmLog, frameFilms, violations };
}

(async () => {
  // 1 och 2: två bildsidor, 13 s och 11 s, snabb laddning
  let res = await run('https://x.test/a|13\nhttps://x.test/b|11', 130, []);
  assert.ok(res.shown.length >= 8, 'för få byten: ' + res.shown.length);
  res.shown.forEach((d, n) => {
    const want = n % 2 === 0 ? 13 : 11;
    assert.ok(Math.abs(d - want) <= 0.5, 'byte ' + (n + 1) + ': visad ' + d.toFixed(1) + ' s, väntat ' + want + ' s');
  });
  res.swaps.forEach((s) => {
    const active = s.id === 'frame-a' ? 0 : 1;
    assert.strictEqual(s.vis[active], 'visible', 'aktiv ram dold vid byte ' + s.t);
    assert.strictEqual(s.vis[1 - active], 'hidden', 'förladdningsramen syns vid byte ' + s.t);
  });
  assert.strictEqual(res.fades.filter((f) => f.on).length, 0, 'ingen ton utan film');
  assert.strictEqual(res.filmLog.filter((e) => e.src).length, 0, 'ingen film ska spelas');

  // 3: film1 (13 s), film2 (11 s), bild (5 s), alla från sidovagnen
  res = await run('https://x.test/api/sign/m/film1|13\nhttps://x.test/api/sign/m/film2|11\nhttps://x.test/api/sign/m/bild|5', 130, [2, 2, 1]);
  assert.deepStrictEqual(res.frameFilms, [], 'en film laddades i en ram: ' + JSON.stringify(res.frameFilms));
  assert.deepStrictEqual(res.violations, [], 'en film startades medan en annan video syntes: ' + res.violations.join(', '));
  const srcs = res.filmLog.filter((e) => e.src);
  assert.ok(srcs.length >= 6, 'för få filmstarter: ' + srcs.length);
  srcs.forEach((e, n) => assert.ok(new RegExp('/f/film' + ((n % 2) + 1) + '\\.mp4$').test(e.src), 'fel film i tur och ordning: ' + e.src));
  assert.ok(res.filmLog.some((e) => e.src === null), 'filmen släpptes aldrig (film till bild)');
  // Film efter film: tonas ut, byts när det är svart, tonas in. Film efter en bild: startas under bilden och tas fram utan ton.
  srcs.slice(1).forEach((e, k) => {
    const n = k + 1; // srcs[n]: n udda = film2 (efter film1), n jämn = film1 (efter bilden)
    const fadeNear = res.fades.filter((f) => f.on && f.t >= e.t - 2 && f.t <= e.t);
    if (n % 2 === 1) {
      const on = res.fades.filter((f) => f.on && f.t <= e.t).pop();
      assert.ok(on && e.t - on.t >= 0.4 - 0.001, 'film startad vid ' + e.t.toFixed(1) + ' s utan att skärmen tonats ut först');
      const off = res.fades.find((f) => !f.on && f.t > e.t);
      assert.ok(off && off.t - e.t <= 3, 'tonen togs inte bort inom 3 s efter ' + e.t.toFixed(1));
    } else {
      assert.strictEqual(fadeNear.length, 0, 'ton vid film efter bild vid ' + e.t.toFixed(1) + ' s');
      // filmen ska ha startats under bilden en kort stund före bytet till den (sidbytet kommer inom 2 s efter filmstarten)
      const ch = res.changes.find((c) => c.t >= e.t - 0.001);
      assert.ok(ch && ch.t - e.t <= 2, 'film efter bild startades inte under bilden vid ' + e.t.toFixed(1) + ' s');
    }
  });
  // ingen sida visas kortare än inställt (längre bara med bytet: ca 1,2 s)
  const secs = [13, 11, 5];
  let prev = null;
  res.changes.forEach((c) => {
    if (prev) {
      const d = c.t - prev.t, want = secs[prev.index];
      assert.ok(d >= want - 0.5, 'sida ' + (prev.index + 1) + ' visades bara ' + d.toFixed(1) + ' s av ' + want);
      assert.ok(d <= want + 3, 'sida ' + (prev.index + 1) + ' visades ' + d.toFixed(1) + ' s av ' + want);
    }
    prev = c;
  });
  assert.ok(res.changes.length >= 8, 'för få sidbyten: ' + res.changes.length);

  // 4: första hämtningen av varje filmsida misslyckas (nät): det sparas inte som 'inte film'. Första sidan kan visas som vanlig sida
  // (i en ram), men aldrig startas en film under en film som spelar i en ram, och nästa filmer känns igen.
  res = await run('https://x.test/api/sign/m/film1|13\nhttps://x.test/api/sign/m/film2|11\nhttps://x.test/api/sign/m/bild|5', 130, [2, 2, 1], true);
  assert.deepStrictEqual(res.violations, [], 'film startad medan en annan video syntes (hämtning misslyckades): ' + res.violations.join(', '));
  assert.ok(res.frameFilms.length <= 1, 'fler än första filmen i en ram: ' + JSON.stringify(res.frameFilms));
  assert.ok(res.filmLog.filter((e) => e.src).length >= 4, 'filmerna kändes inte igen efter ett misslyckat svar');
  console.log('rotator: ok');
})();
