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
  function mk(src) {
    var v = document.createElement('video');
    v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.autoplay = true; v.loop = true;
    v.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain';
    box.appendChild(v); v.src = src; return v;
  }
  function firstFrame(v, label, done) {
    var t = Date.now(), iv = setInterval(function () {
      if (v.currentTime > 0.05) { clearInterval(iv); L(label + ': första bild efter ' + (Date.now() - t) + ' ms'); done(); }
    }, 20);
  }
  // Försök 1: EN video, byt src (A -> B)
  var v = mk(A);
  L('FÖRSÖK 1: en <video>, A spelar 4 s, sen byts src till B');
  setTimeout(function () {
    L('byter src');
    v.src = B; v.play();
    firstFrame(v, 'försök 1 (byt src)', function () {
      setTimeout(function () {
        v.pause(); v.removeAttribute('src'); v.load(); box.removeChild(v);
        L('paus 4 s (svart, ingen film)');
        setTimeout(function () {
          // Försök 2: ny <video> skapas när bytet ska ske (som appen gör), gamla tas bort när nya spelar
          var a = mk(A);
          L('FÖRSÖK 2: A spelar 4 s, sen skapas ny <video> med B som startar direkt');
          setTimeout(function () {
            L('skapar B');
            var b = mk(B);
            firstFrame(b, 'försök 2 (ny video)', function () {
              a.pause(); a.removeAttribute('src'); a.load(); box.removeChild(a);
              setTimeout(function () { box.parentNode.removeChild(box); resolve(log.join('\n')); }, 3000);
            });
          }, 4500);
        }, 4000);
      }, 3000);
    });
  }, 4500);
})
