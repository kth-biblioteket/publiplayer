'use strict';
// Kör: node tests/schedule.test.js
const assert = require('assert');
const s = require('../js/schedule.js');

const d = (iso) => new Date(iso); // lokal tid: "2026-10-19T09:00:00"
// 2026-10-19 är en måndag, 2026-10-24 en lördag, 2026-10-25 en söndag

// SIGN_PAGES: JSON, rader, gränser
assert.deepStrictEqual(
  s.parsePages('[{"url":"https://a.se/x","s":45},{"url":"http://nej.se"},{"url":"https://b.se","s":2},{"url":"https://c.se","s":"x"}]', 30, null).map((p) => [p.url, p.seconds]),
  [['https://a.se/x', 45], ['https://b.se', 5], ['https://c.se', 30]]);
assert.deepStrictEqual(s.parsePages('https://a.se|20\nhttps://b.se', 30, null).map((p) => p.seconds), [20, 30]);
assert.deepStrictEqual(s.parsePages('https://a.se|20\\nhttps://b.se', 30, null).map((p) => p.url), ['https://a.se', 'https://b.se']);
assert.deepStrictEqual(s.parsePages('', 30, null), []);
assert.deepStrictEqual(s.parsePages('[trasig', 30, null), []); // ogiltig JSON tolkas inte som rader
assert.strictEqual(s.parsePages('[trasig', 30, 'https://start.se').length, 1); // reservadressen gäller
assert.strictEqual(s.parsePages('', 30, 'https://start.se')[0].url, 'https://start.se');
assert.strictEqual(s.parsePages(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ url: 'https://a.se/' + i }))), 30, null).length, 36);
const dated = s.parsePages('[{"url":"https://a.se","start":"2026-10-20","end":"2026-10-31"}]', 30, null);
assert.strictEqual(s.on(dated, '2026-10-19').length, 0);
assert.strictEqual(s.on(dated, '2026-10-20').length, 1);
assert.strictEqual(s.on(dated, '2026-10-31').length, 1);
assert.strictEqual(s.on(dated, '2026-11-01').length, 0);

// SIGN_SCHEDULE: ogiltigt eller tomt = null
assert.strictEqual(s.parseSchedule('', 30), null);
assert.strictEqual(s.parseSchedule('[1]', 30), null);
assert.strictEqual(s.parseSchedule('{trasig', 30), null);
assert.strictEqual(s.choose(null, d('2026-10-19T09:00:00')).key, 'default');

const sched = s.parseSchedule(JSON.stringify({
  lists: {
    Dag: [{ url: 'https://dag.se' }],
    Kväll: [{ url: 'https://kvall.se' }],
    Bokrea: [{ url: 'https://rea.se' }],
    Gammal: [{ url: 'https://gammal.se' }],
  },
  periods: { Gammal: ['2026-01-01', '2026-01-31'] },
  slots: [
    { list: 'Dag', days: [1, 2, 3, 4, 5], from: '08:00', to: '19:00' },
    { list: 'Kväll', from: '19:00', to: '24:00' },
    { list: 'Bokrea', dates: ['2026-10-20', '2026-10-31'], from: '10:00', to: '16:00' },
    { list: 'Gammal', from: '00:00', to: '24:00' },
    { list: 'Okänd' },
    { list: 'Dag', from: '19:00', to: '08:00' }, // from efter to: hoppas över
  ],
  off: true,
}), 30);
const key = (iso) => s.choose(sched, d(iso));

assert.strictEqual(key('2026-10-19T09:00:00').pages[0].url, 'https://dag.se');                  // måndag förmiddag
assert.strictEqual(key('2026-10-20T11:00:00').pages[0].url, 'https://rea.se');                  // rad med datum vinner
assert.strictEqual(key('2026-10-20T17:00:00').pages[0].url, 'https://dag.se');                  // reans tid slut
assert.strictEqual(key('2026-10-19T19:00:00').pages[0].url, 'https://kvall.se');                // to ingår inte i Dag
assert.strictEqual(key('2026-10-19T18:59:00').pages[0].url, 'https://dag.se');
assert.strictEqual(key('2026-10-19T23:59:00').pages[0].url, 'https://kvall.se');                // 24:00 = midnatt
assert.deepStrictEqual([key('2026-10-24T09:00:00').black, key('2026-10-24T09:00:00').key], [true, 'off']); // lördag: ingen rad, off
assert.strictEqual(key('2026-10-25T09:00:00').black, true);                                     // söndag
assert.ok(s.parseSchedule(JSON.stringify({ lists: { A: [{ url: 'https://a.se' }] }, slots: [] }), 30));
const noOff = s.parseSchedule(JSON.stringify({ lists: { A: [{ url: 'https://a.se' }] }, slots: [{ list: 'A', days: [1] }] }), 30);
assert.deepStrictEqual(s.choose(noOff, d('2026-10-24T09:00:00')), { key: 'default', pages: null, black: false });

// En lista vars sidor inte gäller idag är som en tom lista
const expired = s.parseSchedule(JSON.stringify({
  lists: { A: [{ url: 'https://a.se', end: '2026-10-01' }] }, slots: [{ list: 'A' }], off: false,
}), 30);
assert.strictEqual(s.choose(expired, d('2026-10-19T09:00:00')).pages, null);

console.log('schedule: ok');
