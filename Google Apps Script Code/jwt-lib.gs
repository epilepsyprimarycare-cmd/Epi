/**
 * A simple library for creating the JSON Web Token (JWT) needed for VAPID web push authentication.
 */
function VapidTokenGenerator(privateKey) {
  const ALGORITHM = 'ES256';
  const CURVE_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  const CURVE_A = BigInt('-3');
  const CURVE_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const CURVE_GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
  const CURVE_GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
  const BYTE_LENGTH = 32;
  const ZERO = BigInt(0);
  const ONE = BigInt(1);
  const TWO = BigInt(2);
  const THREE = BigInt(3);
  const HALF_N = CURVE_N / TWO;
  const EIGHT = BigInt(8);

  function ensureBytes(input) {
    if (!input && input !== 0) return [];
    if (Array.isArray(input)) return input.slice();
    if (typeof input === 'string') {
      return Utilities.newBlob(input).getBytes();
    }
    if (input instanceof Uint8Array) {
      return Array.prototype.slice.call(input);
    }
    return Utilities.newBlob(String(input)).getBytes();
  }

  function base64UrlEncode(input) {
    const bytes = ensureBytes(input);
    return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  }

  function bytesToBigInt(bytes) {
    return ensureBytes(bytes).reduce(function(acc, b) {
      return (acc << EIGHT) + BigInt(b & 0xff);
    }, ZERO);
  }

  function bigIntToBytes(num, length) {
    let hex = num.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    while (bytes.length < length) {
      bytes.unshift(0);
    }
    return bytes;
  }

  function mod(a, m) {
    const res = a % m;
    return res >= ZERO ? res : res + m;
  }

  function modInv(a, m) {
    let lm = ONE;
    let hm = ZERO;
    let low = mod(a, m);
    let high = m;
    while (low > ONE) {
      const ratio = high / low;
      const nm = hm - lm * ratio;
      const newLow = high - low * ratio;
      hm = lm;
      lm = nm;
      high = low;
      low = newLow;
    }
    return mod(lm, m);
  }

  function pointAdd(p, q) {
    if (!p) return q;
    if (!q) return p;
    if (p.x === q.x && p.y !== q.y) return null;

    let m;
    if (p.x === q.x && p.y === q.y) {
      if (p.y === ZERO) return null;
      const numerator = mod(THREE * p.x * p.x + CURVE_A, CURVE_P);
      const denominator = modInv(TWO * p.y, CURVE_P);
      m = mod(numerator * denominator, CURVE_P);
    } else {
      const numerator = mod(q.y - p.y, CURVE_P);
      const denominator = modInv(q.x - p.x, CURVE_P);
      m = mod(numerator * denominator, CURVE_P);
    }

    const rx = mod(m * m - p.x - q.x, CURVE_P);
    const ry = mod(m * (p.x - rx) - p.y, CURVE_P);
    return { x: rx, y: ry };
  }

  function scalarMultiply(k, point) {
    let result = null;
    let addend = point;
    let scalar = k;
    while (scalar > ZERO) {
      if (scalar & ONE) {
        result = pointAdd(result, addend);
      }
      addend = pointAdd(addend, addend);
      scalar >>= ONE;
    }
    return result;
  }

  function bits2octets(bytes) {
    const z1 = bytesToBigInt(bytes);
    const z2 = mod(z1, CURVE_N);
    return bigIntToBytes(z2, BYTE_LENGTH);
  }

  function hmacSha256(keyBytes, dataBytes) {
    return Utilities.computeHmacSha256Signature(dataBytes, keyBytes);
  }

  function deterministicK(privateBytes, hashBytes) {
    const x = bits2octets(privateBytes);
    const h1 = bits2octets(hashBytes);
    let v = new Array(BYTE_LENGTH).fill(0x01);
    let k = new Array(BYTE_LENGTH).fill(0x00);

    k = hmacSha256(k, v.concat([0x00], x, h1));
    v = hmacSha256(k, v);
    k = hmacSha256(k, v.concat([0x01], x, h1));
    v = hmacSha256(k, v);

    while (true) {
      v = hmacSha256(k, v);
      const candidate = bytesToBigInt(v);
      if (candidate > ZERO && candidate < CURVE_N) {
        return candidate;
      }
      k = hmacSha256(k, v.concat([0x00]));
      v = hmacSha256(k, v);
    }
  }

  function encodeJoseSignature(r, s) {
    // ES256 JWT signatures must be raw r||s (no DER wrapper)
    const rBytes = bigIntToBytes(r, BYTE_LENGTH);
    const sBytes = bigIntToBytes(s, BYTE_LENGTH);
    return rBytes.concat(sBytes);
  }

  function signDigest(privateKeyBytes, digestBytes) {
    const d = mod(bytesToBigInt(privateKeyBytes), CURVE_N);
    if (d <= ZERO || d >= CURVE_N) {
      throw new Error('VAPID private key is not valid for P-256.');
    }

    while (true) {
      const k = deterministicK(privateKeyBytes, digestBytes);
      const point = scalarMultiply(k, { x: CURVE_GX, y: CURVE_GY });
      if (!point) continue;
      const r = mod(point.x, CURVE_N);
      if (r === ZERO) continue;
      const kInv = modInv(k, CURVE_N);
      const z = mod(bytesToBigInt(digestBytes), CURVE_N);
      let s = mod(kInv * (z + r * d), CURVE_N);
      if (s === ZERO) continue;
      if (s > HALF_N) {
        s = CURVE_N - s;
      }
      return encodeJoseSignature(r, s);
    }
  }

  // Creates the JWT
  this.generate = function(audience) {
    const header = {
      'typ': 'JWT',
      'alg': ALGORITHM
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      'aud': audience,
      'exp': now + (12 * 60 * 60), // Token is valid for 12 hours
      'sub': 'mailto:your-email@example.com' // Replace with your email
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = headerB64 + '.' + payloadB64;

    const digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, unsignedToken);
    const privateKeyBytes = Utilities.base64DecodeWebSafe(privateKey);
    const signatureDer = signDigest(privateKeyBytes, digestBytes);
    const signatureB64 = base64UrlEncode(signatureDer);

    return unsignedToken + '.' + signatureB64;
  };
}