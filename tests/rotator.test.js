'use strict';
// Kör: node tests/rotator.test.js
// Kör den riktiga js/rotator.js med virtuell klocka och kontrollerar att varje sida visas exakt sin inställda tid. Utan rättelsen
// i scheduleNext (tiden räknas från när sidan började visas) visades sidorna 18 och 22 s i stället för 13 och 11 s.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const rotatorPath = path.join(root, 'js/rotator.js');
const total = 130;

let now = 0, seq = 0;
const timers = new Map();
const RealDate = Date;
const base = new RealDate('2026-10-21T10:00:00').getTime();
function VDate(a) { return a === undefined ? new RealDate(base + now) : new RealDate(a); }
VDate.now = () => base + now;
VDate.prototype = RealDate.prototype;

function setTimeoutV(fn, ms) { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn, id }); return id; }
function clearTimeoutV(id) { timers.delete(id); }

const swaps = [];
function mkEl(id) {
  const attrs = {}; const listeners = {};
  return {
    id, style: {}, listeners,
    addEventListener(ev, fn) { listeners[ev] = fn; },
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; },
    getAttribute(k) { return attrs[k] === undefined ? null : attrs[k]; },
    set src(v) { attrs.src = v; if (v !== 'about:blank') setTimeoutV(() => listeners.load && listeners.load(), 300); },
    get src() { return attrs.src; },
    contentWindow: { postMessage(msg) { swaps.push({ t: now / 1000, id, msg, url: attrs.src }); } },
  };
}

const sandbox = {
  setTimeout: setTimeoutV, clearTimeout: clearTimeoutV, Date: VDate, Promise,
  navigator: { onLine: true },
  fetch: () => Promise.resolve({ ok: true, status: 200 }),
  console,
};
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
vm.createContext(sandbox);
const sched = require(path.join(root, 'js/schedule.js'));
sandbox.PP = { schedule: sched };
vm.runInContext(fs.readFileSync(rotatorPath, 'utf8'), sandbox);

const ui = { error() {}, black() {} };
const r = new sandbox.PP.Rotator(mkEl('frame-a'), mkEl('frame-b'), ui);
const pages = sched.parsePages('https://x.test/a|13\nhttps://x.test/b|11', 30, null);
r.configure({ defaultList: pages, schedule: null, scripts: true, onLoaded() {} });

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

(async () => {
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
  assert.ok(shown.length >= 8, 'för få byten: ' + shown.length);
  // Första bytet efter 13 s (sida 1), därefter växelvis 11 s (sida 2) och 13 s (sida 1)
  shown.forEach((d, n) => {
    const want = n % 2 === 0 ? 13 : 11;
    assert.ok(Math.abs(d - want) <= 0.5, 'byte ' + (n + 1) + ': visad ' + d.toFixed(1) + ' s, väntat ' + want + ' s');
  });
  console.log('rotator: ok');
})();
