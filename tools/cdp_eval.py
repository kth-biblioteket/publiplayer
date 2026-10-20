#!/usr/bin/env python3
"""Kör ett JavaScript-uttryck i skärmens huvudsida via inspektören och skriver ut resultatet.
Användning: cdp_eval.py <värd> <port> <js-fil> [timeout-sekunder]"""
import base64, json, os, re, socket, struct, sys, time, urllib.request

HOST, PORT, JSFILE = sys.argv[1], int(sys.argv[2]), sys.argv[3]
TIMEOUT = int(sys.argv[4]) if len(sys.argv) > 4 else 40
expr = open(JSFILE, encoding='utf-8').read()

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


def send(obj):
    data = json.dumps(obj).encode()
    mask = os.urandom(4)
    n = len(data)
    head = b'\x81' + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack('>H', n) if n < 65536 else bytes([0x80 | 127]) + struct.pack('>Q', n))
    s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


send({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True, 'returnByValue': True, 'timeout': TIMEOUT * 1000}})
t0 = time.time()
while time.time() - t0 < TIMEOUT + 5:
    try:
        chunk = s.recv(65536)
        if chunk:
            buf += chunk
    except socket.timeout:
        pass
    while len(buf) >= 2:
        n = buf[1] & 0x7f
        off = 2
        if n == 126:
            if len(buf) < 4: break
            n = struct.unpack('>H', bytes(buf[2:4]))[0]; off = 4
        elif n == 127:
            if len(buf) < 10: break
            n = struct.unpack('>Q', bytes(buf[2:10]))[0]; off = 10
        if len(buf) < off + n:
            break
        payload = bytes(buf[off:off + n]); op = buf[0] & 0x0f
        del buf[:off + n]
        if op != 1:
            continue
        ev = json.loads(payload.decode('utf-8', 'replace'))
        if ev.get('id') == 1:
            r = ev.get('result', {}).get('result', {})
            print(r.get('value', json.dumps(ev)[:600]))
            sys.exit(0)
print('inget svar')
