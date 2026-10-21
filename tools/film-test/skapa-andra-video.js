new Promise(function (resolve) {
  var BASE = 'https://apps-ref.lib.kth.se/publicomtools/api/sign/f/';
  var A = BASE + 'e060bb797d64b485287c902e51f89b782f39ac3ec876ac007731903373eafe64.mp4';
  var B = BASE + '87db8bbb67097799003e263e6e580274e2d907cca02b2d1675464865dec34e53.mp4';
  [].forEach.call(document.querySelectorAll('iframe'), function (f) { f.parentNode.removeChild(f); });
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:9999;background:#000';
  document.documentElement.appendChild(box);
  var t0 = Date.now(), log = [];
  function L(s) { log.push(((Date.now() - t0) / 1000).toFixed(2) + 's ' + s); }
  function mk(src, z) {
    var v = document.createElement('video');
    v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;z-index:' + z;
    box.appendChild(v); v.src = src;
    return v;
  }
  var v1 = mk(A, 2); v1.loop = true; v1.autoplay = true; L('v1 skapad (film A spelar)');
  setTimeout(function () {
    L('v1 t=' + v1.currentTime.toFixed(1) + ' skapar v2 (film B) UTAN play, preload=auto');
    var v2 = mk(B, 1); v2.preload = 'auto';
    var seen = [];
    var iv = setInterval(function () { seen.push(v1.currentTime.toFixed(1) + '/' + v2.readyState); }, 500);
    setTimeout(function () {
      clearInterval(iv);
      L('v1.currentTime var 0,5 s (v1/v2 readyState): ' + seen.join(' '));
      var tPlay = Date.now(), first = 0;
      v2.addEventListener('playing', function () { L('v2 playing efter ' + (Date.now() - tPlay) + ' ms'); });
      var chk = setInterval(function () {
        if (!first && v2.currentTime > 0.05) { first = Date.now(); L('v2 första bild (t>0.05) efter ' + (first - tPlay) + ' ms; v1.t=' + v1.currentTime.toFixed(1)); v1.style.zIndex = 0; clearInterval(chk); }
      }, 20);
      L('anropar v2.play()');
      v2.play();
      setTimeout(function () {
        L('slut: v2.t=' + v2.currentTime.toFixed(1) + ' v1.t=' + v1.currentTime.toFixed(1));
        box.parentNode.removeChild(box);
        resolve(log.join('\n'));
      }, 5000);
    }, 6000);
  }, 4000);
})
