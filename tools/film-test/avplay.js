new Promise(function (resolve) {
  var BASE = 'https://apps-ref.lib.kth.se/publicomtools/api/sign/f/';
  var A = BASE + 'e060bb797d64b485287c902e51f89b782f39ac3ec876ac007731903373eafe64.mp4';
  var B = BASE + '87db8bbb67097799003e263e6e580274e2d907cca02b2d1675464865dec34e53.mp4';
  var av = window.webapis.avplay, t0 = Date.now(), log = [];
  function L(s) { log.push(((Date.now() - t0) / 1000).toFixed(2) + 's ' + s); }
  var saved = [];
  [].forEach.call(document.querySelectorAll('iframe'), function (f) { saved.push([f, f.style.display]); f.style.display = 'none'; });
  var oldBg = [document.documentElement.style.background, document.body.style.background];
  document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent';
  var obj = document.createElement('object');
  obj.id = 'av-player'; obj.setAttribute('type', 'application/avplayer');
  obj.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1';
  document.body.appendChild(obj);
  var W = window.innerWidth, H = window.innerHeight;
  L('skärm ' + W + 'x' + H + ', avplay state ' + av.getState());
  function done(why) {
    try { av.stop(); } catch (e) {}
    try { av.close(); } catch (e) {}
    obj.parentNode.removeChild(obj);
    saved.forEach(function (p) { p[0].style.display = p[1]; });
    document.documentElement.style.background = oldBg[0]; document.body.style.background = oldBg[1];
    L('klart: ' + why);
    resolve(log.join('\n'));
  }
  function startFile(url, label, next) {
    var t = Date.now();
    try {
      av.open(url);
      av.setDisplayRect(0, 0, W, H);
      av.setListener({
        onbufferingstart: function () { L(label + ' buffring startar'); },
        onbufferingcomplete: function () { L(label + ' buffring klar'); },
        onerror: function (e) { L(label + ' FEL ' + e); },
        onstreamcompleted: function () { L(label + ' slut på strömmen'); }
      });
      av.prepareAsync(function () {
        L(label + ' prepare klar efter ' + (Date.now() - t) + ' ms');
        av.play();
        L(label + ' play() anropad efter ' + (Date.now() - t) + ' ms, state ' + av.getState());
        var chk = setInterval(function () {
          var ct = 0; try { ct = av.getCurrentTime(); } catch (e) {}
          if (ct > 50) { clearInterval(chk); L(label + ' första bild (currentTime ' + ct + ' ms) efter ' + (Date.now() - t) + ' ms'); next(); }
        }, 20);
      }, function (e) { L(label + ' prepare FEL ' + e); done('prepare misslyckades'); });
    } catch (e) { L(label + ' undantag: ' + e.name + ' ' + e.message); done('undantag'); }
  }
  startFile(A, 'A', function () {
    setTimeout(function () {
      L('A har spelat ca 4 s. Försöker open(B) medan A spelar (state ' + av.getState() + ')');
      try { av.open(B); L('open(B) under uppspelning gick utan fel, state ' + av.getState()); } catch (e) { L('open(B) under uppspelning: ' + e.name + ' ' + e.message); }
      var tStop = Date.now();
      try { av.stop(); } catch (e) { L('stop fel ' + e.message); }
      try { av.close(); } catch (e) { L('close fel ' + e.message); }
      L('A stoppad och stängd efter ' + (Date.now() - tStop) + ' ms; svart börjar');
      startFile(B, 'B', function () {
        L('B spelar. Svart totalt (stop → första bild): ' + (Date.now() - tStop) + ' ms');
        setTimeout(function () { done('B spelade 4 s'); }, 4000);
      });
    }, 4000);
  });
})
