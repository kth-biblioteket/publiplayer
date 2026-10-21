
new Promise(function (resolve) {
  var BASE = 'http://172.20.10.4:8099/';
  var SEQ = ["A"];   // [{n:'A', type:..., dur: s}]
  var TYPES = { A: 'video/mp4; codecs="avc1.64002a"', B: 'video/mp4; codecs="avc1.4d0028"' };
  var DURS = { A: 11.82, B: 10.0 };
  var log = [], t0 = Date.now();
  function L(s) { log.push(((Date.now() - t0) / 1000).toFixed(2) + 's ' + s); }
  [].forEach.call(document.querySelectorAll('iframe'), function (f) { f.style.display = 'none'; });
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:9999;background:#000';
  document.documentElement.appendChild(box);
  var v = document.createElement('video');
  v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain';
  box.appendChild(v);
  function finish(why) {
    L('slut: ' + why + '; v.error=' + (v.error ? v.error.code : 'nej') + ' currentTime=' + v.currentTime.toFixed(2));
    box.parentNode.removeChild(box);
    [].forEach.call(document.querySelectorAll('iframe'), function (f) { f.style.display = ''; });
    resolve(log.join('\n'));
  }
  var names = {}; SEQ.forEach(function (n) { names[n] = 1; });
  var files = []; Object.keys(names).forEach(function (n) { files.push(n + '.init.mp4', n + '.media.m4s'); });
  Promise.all(files.map(function (f) { return fetch(BASE + f).then(function (r) { return r.arrayBuffer(); }); })).then(function (d) {
    var data = {}; files.forEach(function (f, i) { data[f] = d[i]; });
    var ms = new MediaSource();
    v.src = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', function () {
      var sb = ms.addSourceBuffer(TYPES[SEQ[0]]);
      var offset = 0, total = 0;
      function appendAll(i) {
        if (i >= SEQ.length) return play();
        var n = SEQ[i];
        sb.timestampOffset = offset;
        function a(buf, cb) {
          var f = function () { sb.removeEventListener('updateend', f); cb(); };
          sb.addEventListener('updateend', f);
          try { sb.appendBuffer(buf); } catch (e) { sb.removeEventListener('updateend', f); L('append fel ' + e.name + ' ' + e.message); finish('append'); }
        }
        a(data[n + '.init.mp4'], function () { a(data[n + '.media.m4s'], function () { L(n + ' tillagd vid offset ' + offset + '; buffrat ' + sb.buffered.end(sb.buffered.length - 1).toFixed(2)); offset += DURS[n]; total += DURS[n]; appendAll(i + 1); }); });
      }
      function play() {
        try { ms.endOfStream(); } catch (e) {}
        ['waiting', 'stalled', 'error', 'ended'].forEach(function (n) { v.addEventListener(n, function () { L('händelse ' + n + ' vid t=' + v.currentTime.toFixed(2) + (v.error ? ' fel=' + v.error.code : '')); }); });
        var p = v.play(); if (p && p.catch) p.catch(function (e) { L('play avvisad ' + e.name); });
        var last = -1, lastAt = Date.now(), maxStill = 0, started = false;
        var iv = setInterval(function () {
          var ct = v.currentTime;
          if (ct !== last) { var gap = Date.now() - lastAt; if (started && gap > maxStill) maxStill = gap; if (ct > 0.05) started = true; last = ct; lastAt = Date.now(); }
          if (v.ended || ct > total - 0.2 || v.error) { clearInterval(iv); L('längsta stillastående: ' + maxStill + ' ms'); setTimeout(function () { finish(v.error ? 'FEL' : 'klar'); }, 500); }
        }, 20);
        setTimeout(function () { clearInterval(iv); finish('tidsgräns'); }, 30000);
      }
      appendAll(0);
    });
  });
})
