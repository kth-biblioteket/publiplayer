#!/usr/bin/env python3
"""Signerar och verifierar Tizen-webbpaket (.wgt) utan Tizen Studio, med bara Python och openssl.

Formatet är W3C Widget Digital Signature som Tizen använder: author-signature.xml (författarcertifikatet) och
signature1.xml (distributörscertifikatet). Båda är XML-DSig med exklusiv C14N, RSA-SHA256 och en sha256-referens per fil,
plus en referens till egenskapsobjektet #prop. Implementationen är kontrollerad mot ett paket som Samsung signerat:
`verify` räknar om alla sidhash och verifierar signaturvärdena mot certifikaten i filerna.

  python3 build/tizen_sign.py verify <paketmapp eller .wgt>
  python3 build/tizen_sign.py sign <paketmapp> <ut.wgt> <certmapp med author.p12 och distributor.p12> [<mapp med distributor.p12>]

Lösenorden till .p12-filerna frågas efter i terminalen (getpass), eller läses ur miljövariablerna
PUBLIPLAYER_AUTHOR_PASS och PUBLIPLAYER_DISTRIBUTOR_PASS (bara för tester). De skrivs aldrig ut eller sparas.
"""
import base64
import getpass
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from urllib.parse import quote, unquote

DSIG = 'http://www.w3.org/2000/09/xmldsig#'
SIGNATURE_FILES = ('author-signature.xml', 'signature1.xml')


def b64(data):
    return base64.b64encode(data).decode('ascii')


def sha256_b64(data):
    return b64(hashlib.sha256(data).digest())


def run(cmd, data=None, env=None):
    p = subprocess.run(cmd, input=data, capture_output=True, env=env)
    if p.returncode != 0:
        raise RuntimeError('%s misslyckades: %s' % (cmd[0:3], p.stderr.decode('utf-8', 'replace').strip()))
    return p.stdout


# ---------- kanonisk form (samma som Tizens egen utskrift) ----------

def canonical_signed_info(signed_info_xml):
    """Exklusiv C14N av <SignedInfo>: namnrymden läggs på elementet, resten är oförändrad text."""
    assert signed_info_xml.startswith('<SignedInfo>')
    return ('<SignedInfo xmlns="%s">' % DSIG) + signed_info_xml[len('<SignedInfo>'):]


def canonical_object(object_xml):
    """C14N 1.1 av <Object Id="prop">: namnrymden först, sedan attributen."""
    assert object_xml.startswith('<Object Id="prop">')
    return ('<Object xmlns="%s" Id="prop">' % DSIG) + object_xml[len('<Object Id="prop">'):]


def prop_object(role, signature_id):
    r = 'role-author' if role == 'author' else 'role-distributor'
    return ('<Object Id="prop"><SignatureProperties xmlns:dsp="http://www.w3.org/2009/xmldsig-properties">'
            '<SignatureProperty Id="profile" Target="#%s"><dsp:Profile URI="http://www.w3.org/ns/widgets-digsig#profile"></dsp:Profile></SignatureProperty>'
            '<SignatureProperty Id="role" Target="#%s"><dsp:Role URI="http://www.w3.org/ns/widgets-digsig#%s"></dsp:Role></SignatureProperty>'
            '<SignatureProperty Id="identifier" Target="#%s"><dsp:Identifier></dsp:Identifier></SignatureProperty>'
            '</SignatureProperties></Object>') % (signature_id, signature_id, r, signature_id)


# ---------- bygga en signatur ----------

def reference(uri, digest, prop=False):
    out = '<Reference URI="%s">\n' % uri
    if prop:
        out += '<Transforms>\n<Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></Transform>\n</Transforms>\n'
    out += '<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>\n'
    out += '<DigestValue>%s</DigestValue>\n</Reference>\n' % digest
    return out


def build_signature(role, file_digests, certs_b64, sign):
    """file_digests: [(kodad sökväg, base64 sha256)] i den ordning de ska stå. sign(bytes) -> signaturbytes."""
    sid = 'AuthorSignature' if role == 'author' else 'DistributorSignature'
    obj = prop_object(role, sid)
    signed_info = ('<SignedInfo>\n<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>\n'
                   '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>\n')
    for uri, digest in file_digests:
        signed_info += reference(uri, digest)
    signed_info += reference('#prop', sha256_b64(canonical_object(obj).encode('utf-8')), prop=True)
    signed_info += '</SignedInfo>'
    sig = sign(canonical_signed_info(signed_info).encode('utf-8'))
    key_info = '<KeyInfo>\n<X509Data>\n' + ''.join('<X509Certificate>%s</X509Certificate>\n' % c for c in certs_b64) + '</X509Data>\n</KeyInfo>'
    return ('<Signature xmlns="%s" Id="%s">\n%s\n<SignatureValue>%s</SignatureValue>\n%s\n%s\n</Signature>'
            % (DSIG, sid, signed_info, b64(sig), key_info, obj))


# ---------- läsa en signatur ----------

def parse_signature(xml):
    m = re.search(r'<SignedInfo>.*?</SignedInfo>', xml, re.S)
    obj = re.search(r'<Object Id="prop">.*?</Object>', xml, re.S)
    sv = re.search(r'<SignatureValue[^>]*>(.*?)</SignatureValue>', xml, re.S)
    certs = re.findall(r'<X509Certificate>(.*?)</X509Certificate>', xml, re.S)
    refs = re.findall(r'<Reference URI="([^"]*)">.*?<DigestValue>(.*?)</DigestValue>', m.group(0), re.S)
    return m.group(0), obj.group(0), ''.join(sv.group(1).split()), [''.join(c.split()) for c in certs], refs


def cert_pem(b64der):
    return '-----BEGIN CERTIFICATE-----\n' + '\n'.join(b64der[i:i + 64] for i in range(0, len(b64der), 64)) + '\n-----END CERTIFICATE-----\n'


def verify_rsa_sha256(cert_b64, data, sig_b64):
    with tempfile.TemporaryDirectory() as d:
        pub = run(['openssl', 'x509', '-pubkey', '-noout'], cert_pem(cert_b64).encode())
        open(d + '/pub.pem', 'wb').write(pub)
        open(d + '/sig.bin', 'wb').write(base64.b64decode(sig_b64))
        p = subprocess.run(['openssl', 'dgst', '-sha256', '-verify', d + '/pub.pem', '-signature', d + '/sig.bin'], input=data, capture_output=True)
        return p.returncode == 0


def read_package(path):
    """Filer i en mapp eller .wgt: {relativ sökväg: bytes}."""
    files = {}
    if os.path.isdir(path):
        for root, _, names in os.walk(path):
            for n in names:
                if n == '.DS_Store':
                    continue
                full = os.path.join(root, n)
                files[os.path.relpath(full, path).replace(os.sep, '/')] = open(full, 'rb').read()
    else:
        with zipfile.ZipFile(path) as z:
            for i in z.infolist():
                if not i.is_dir() and not i.filename.endswith('.DS_Store'):
                    files[i.filename] = z.read(i)
    return files


def verify_package(path, verbose=True):
    files = read_package(path)
    ok = True
    for name in SIGNATURE_FILES:
        if name not in files:
            print('SAKNAS:', name)
            ok = False
            continue
        xml = files[name].decode('utf-8')
        signed_info, obj, sig, certs, refs = parse_signature(xml)
        bad = []
        covered = set()
        for uri, digest in refs:
            if uri == '#prop':
                got = sha256_b64(canonical_object(obj).encode('utf-8'))
            else:
                rel = unquote(uri)
                covered.add(rel)
                got = sha256_b64(files[rel]) if rel in files else None
            if got != digest:
                bad.append(uri)
        missing = sorted(set(files) - covered - set(SIGNATURE_FILES))
        sig_ok = verify_rsa_sha256(certs[0], canonical_signed_info(signed_info).encode('utf-8'), sig)
        if verbose:
            print('%s: %d referenser, felaktiga hashar: %s, filer utan referens: %s, signaturvärde: %s'
                  % (name, len(refs), bad or 'inga', missing or 'inga', 'OK' if sig_ok else 'FEL'))
        ok = ok and not bad and sig_ok and (name == 'signature1.xml' or not missing)
    return ok


# ---------- signera ----------

def p12_material(p12, password):
    """Returnerar (privat nyckel som PEM, [certifikat i DER-base64: lövet först, sedan kedjan])."""
    env = dict(os.environ, PP_P12_PASS=password)
    base = ['openssl', 'pkcs12', '-in', p12, '-passin', 'env:PP_P12_PASS']
    last = None
    for extra in ([], ['-legacy']):
        try:
            key = run(base + extra + ['-nocerts', '-nodes'], env=env).decode()
            certs = run(base + extra + ['-nokeys'], env=env).decode()
            break
        except RuntimeError as e:
            last = e
    else:
        raise RuntimeError('Kunde inte läsa %s (fel lösenord?): %s' % (p12, last))
    key_pem = re.search(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----', key, re.S).group(0) + '\n'
    pems = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', certs, re.S)
    ders = [''.join(p.split('\n')[1:-1]) for p in pems]
    # Lövcertifikatet (det som hör till nyckeln) först; resten i given ordning
    pub_of_key = run(['openssl', 'pkey', '-pubout'], key_pem.encode())
    leaf = None
    for p, d in zip(pems, ders):
        if run(['openssl', 'x509', '-pubkey', '-noout'], (p + '\n').encode()) == pub_of_key:
            leaf = d
    if leaf is None:
        raise RuntimeError('Hittar inget certifikat som hör till nyckeln i %s' % p12)
    return key_pem, [leaf] + [d for d in ders if d != leaf]


def make_signer(key_pem):
    def sign(data):
        d = tempfile.mkdtemp()
        try:
            os.chmod(d, 0o700)
            kp = d + '/k.pem'
            fd = os.open(kp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as f:
                f.write(key_pem)
            return run(['openssl', 'dgst', '-sha256', '-sign', kp], data)
        finally:
            shutil.rmtree(d, ignore_errors=True)
    return sign


def ask(name, env_name):
    if os.environ.get(env_name):
        return os.environ[env_name]
    return getpass.getpass('Lösenord till %s: ' % name)


def sign_package(pkg_dir, out_wgt, cert_dir, dist_dir=None):
    files = read_package(pkg_dir)
    for n in SIGNATURE_FILES:
        files.pop(n, None)
    author_key, author_certs = p12_material(os.path.join(cert_dir, 'author.p12'), ask('author.p12', 'PUBLIPLAYER_AUTHOR_PASS'))
    dist_key, dist_certs = p12_material(os.path.join(dist_dir or cert_dir, 'distributor.p12'), ask('distributor.p12', 'PUBLIPLAYER_DISTRIBUTOR_PASS'))
    digests = sorted((quote(n, safe=''), sha256_b64(data)) for n, data in files.items())
    author_xml = build_signature('author', digests, author_certs, make_signer(author_key))
    files['author-signature.xml'] = author_xml.encode('utf-8')
    dist_digests = sorted([('author-signature.xml', sha256_b64(files['author-signature.xml']))] + digests)
    dist_xml = build_signature('distributor', dist_digests, dist_certs, make_signer(dist_key))
    files['signature1.xml'] = dist_xml.encode('utf-8')
    tmp = out_wgt + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in sorted(files):
            z.writestr(n, files[n])
    os.replace(tmp, out_wgt)
    return verify_package(out_wgt)


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'verify':
        sys.exit(0 if verify_package(sys.argv[2]) else 1)
    if len(sys.argv) in (5, 6) and sys.argv[1] == 'sign':
        ok = sign_package(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) == 6 else None)
        print('signerat:', sys.argv[3], '(egenkontroll %s)' % ('OK' if ok else 'FEL'))
        sys.exit(0 if ok else 1)
    print(__doc__)
    sys.exit(2)
