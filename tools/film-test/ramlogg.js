new Promise(function (resolve) {
  var out = [], t0 = Date.now(), last = '';
  function snap() {
    var parts = [];
    ['frame-a', 'frame-b'].forEach(function (id) {
      var el = document.getElementById(id), s = '?';
      if (!el) return parts.push(id + ':saknas');
      var src = (el.getAttribute('src') || '').replace(/^https?:\/\/[^\/]+/, '').replace(/^\/publicomtools/, '').slice(-14);
      var v = null;
      try { v = el.contentDocument && el.contentDocument.querySelector('video'); } catch (e) {}
      var vs = v ? (v.paused ? 'P' : 'spelar') + ' t=' + (Math.round(v.currentTime * 10) / 10) + ' r' + v.readyState : (src === 'about:blank' ? '' : 'novideo');
      parts.push(id.slice(-1).toUpperCase() + ':z' + el.style.zIndex + (el.style.visibility === 'hidden' ? 'H' : 'V') + ' ' + src + ' ' + vs);
    });
    var line = parts.join(' | ');
    out.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + line);
  }
  var iv = setInterval(snap, 1000);
  setTimeout(function () { clearInterval(iv); resolve(out.join('\n')); }, 75000);
})
