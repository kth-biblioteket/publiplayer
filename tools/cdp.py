#!/usr/bin/env python3
"""Minimal Chrome DevTools Protocol-klient (bara standardbiblioteket) mot skärmens inspektör.
Användning: cdp.py <värd> <port> <sekunder> [--reload]"""
import base64, json, os, re, socket, struct, sys, time, urllib.request

HOST, PORT = sys.argv[1], int(sys.argv[2])
SECONDS = int(sys.argv[3]) if len(sys.argv) > 3 else 40
RELOAD = '--reload' in sys.argv

pages = json.load(urllib.request.urlopen('http://%s:%d/json' % (HOST, PORT), timeout=10))
ws_path = re.sub(r'^ws://[^/]+', '', pages[0]['webSocketDebuggerUrl'])

s = socket.create_connection((HOST, PORT), timeout=10)
key = base64.b64encode(os.urandom(16)).decode()
s.sendall(('GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n'
           % (ws_path, HOST, PORT, key)).encode())
resp = b''
while b'\r\n\r\n' not in resp:
    resp += s.recv(1024)
assert b' 101 ' in resp.split(b'\r\n')[0], resp[:200]
buf = bytearray(resp.split(b'\r\n\r\n', 1)[1])
s.settimeout(1.0)

mid = [0]


def send(obj):
    data = json.dumps(obj).encode()
    mask = os.urandom(4)
    n = len(data)
    head = b'\x81'
    if n < 126:
        head += bytes([0x80 | n])
    elif n < 65536:
        head += bytes([0x80 | 126]) + struct.pack('>H', n)
    else:
        head += bytes([0x80 | 127]) + struct.pack('>Q', n)
    s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


def cmd(method, params=None):
    mid[0] += 1
    send({'id': mid[0], 'method': method, 'params': params or {}})
    return mid[0]


def short(u, n=70):
    return re.sub(r'^https?://[^/]+', '', u or '')[:n]


contexts, requests, results, pending, log = {}, {}, {}, {}, []
for m in ('Network.enable', 'Page.enable', 'Runtime.enable', 'Log.enable', 'Console.enable'):
    cmd(m)
if RELOAD:
    cmd('Page.reload', {'ignoreCache': False})

EXPR = ("(function(){var v=document.querySelector('video');if(!v)return 'ingen video i detta dokument ('+location.href.slice(0,60)+')';"
        "return JSON.stringify({paused:v.paused,ready:v.readyState,network:v.networkState,w:v.videoWidth,h:v.videoHeight,t:v.currentTime,"
        "muted:v.muted,err:v.error&&v.error.code,src:(v.currentSrc||v.src).slice(-60),buffered:v.buffered.length?v.buffered.end(0):0});})()")

t0 = time.time()
evaluated = False
while time.time() - t0 < SECONDS:
    try:
        chunk = s.recv(65536)
        if chunk:
            buf += chunk
    except socket.timeout:
        pass
    while len(buf) >= 2:
        b1, b2 = buf[0], buf[1]
        n = b2 & 0x7f
        off = 2
        if n == 126:
            if len(buf) < 4: break
            n = struct.unpack('>H', bytes(buf[2:4]))[0]; off = 4
        elif n == 127:
            if len(buf) < 10: break
            n = struct.unpack('>Q', bytes(buf[2:10]))[0]; off = 10
        if len(buf) < off + n:
            break
        payload = bytes(buf[off:off + n])
        del buf[:off + n]
        if (b1 & 0x0f) != 1:
            continue
        try:
            ev = json.loads(payload.decode('utf-8', 'replace'))
        except Exception:
            continue
        method, p = ev.get('method'), ev.get('params', {})
        el = '%5.1fs ' % (time.time() - t0)
        if method == 'Runtime.executionContextCreated':
            c = p['context']; contexts[c['id']] = c
        elif method == 'Network.requestWillBeSent':
            u = p['request']['url']; requests[p['requestId']] = u
            if '/api/sign/' in u or 'mp4' in u:
                hh = {k: v for k, v in p['request']['headers'].items() if k.lower() in ('range', 'accept')}
                log.append(el + 'BEGÄRAN  %s %s %s' % (p['request']['method'], short(u), hh))
        elif method == 'Network.responseReceived':
            u = p['response']['url']
            if '/api/sign/' in u or 'mp4' in u:
                h = p['response'].get('headers', {})
                log.append(el + 'SVAR     %s %s %s len=%s type=%s' % (p['response']['status'], short(u, 60), p['response'].get('protocol', ''),
                                                                      h.get('Content-Length', h.get('content-length', '?')), p['response'].get('mimeType')))
        elif method == 'Network.loadingFailed':
            log.append(el + 'MISSLYCKAD %s %s canceled=%s' % (p.get('errorText'), short(requests.get(p['requestId'], '?'), 60), p.get('canceled')))
        elif method == 'Network.loadingFinished':
            u = requests.get(p['requestId'], '')
            if '/api/sign/f/' in u:
                log.append(el + 'KLAR     %s byte=%s' % (short(u, 60), p.get('encodedDataLength')))
        elif method == 'Runtime.consoleAPICalled':
            log.append(el + 'KONSOL   %s: %s' % (p.get('type', ''), ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))[:200]))
        elif method == 'Runtime.exceptionThrown':
            d = p['exceptionDetails']
            log.append(el + 'UNDANTAG %s %s' % (d.get('text'), str(d.get('exception', {}).get('description', ''))[:200]))
        elif method == 'Log.entryAdded':
            e = p['entry']
            log.append(el + 'LOGG     %s %s: %s %s' % (e.get('level'), e.get('source'), e.get('text', '')[:200], e.get('url', '')[-60:]))
        elif method == 'Page.frameNavigated':
            log.append(el + 'RAM      %s' % short(p['frame'].get('url', ''), 80))
        elif 'id' in ev:
            results[ev['id']] = ev
    if not evaluated and time.time() - t0 > SECONDS - 8:
        evaluated = True
        for cid, c in list(contexts.items()):
            origin = c.get('origin', '')
            if 'apps-ref' in origin or 'apps.lib' in origin:
                pending[cmd('Runtime.evaluate', {'expression': EXPR, 'contextId': cid, 'returnByValue': True})] = origin

print('--- logg (%d händelser)' % len(log))
for l in log[:90]:
    print(l)
print('--- origin för sidor/ramar:', sorted(set(c.get('origin', '') for c in contexts.values())))
time.sleep(0)
for i, origin in pending.items():
    r = results.get(i, {})
    print('--- video i', origin, '=>', r.get('result', {}).get('result', {}).get('value', r))
