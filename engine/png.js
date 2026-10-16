'use strict';
/**
 * Minimal PNG encoder (8-bit gray or gray+alpha) and base64 helper.
 * Compression uses fflate (pure JavaScript).
 */
const {zlibSync} = require('fflate');

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

function crc32(bytes, start, end) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeU32(buf, off, v) {
  buf[off] = (v >>> 24) & 0xff;
  buf[off + 1] = (v >>> 16) & 0xff;
  buf[off + 2] = (v >>> 8) & 0xff;
  buf[off + 3] = v & 0xff;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeU32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/**
 * @param {Uint8Array} pixels row-major samples
 * @param {number} width
 * @param {number} height
 * @param {number} channels 1 (gray) or 2 (gray + alpha)
 * @param {number} [dpi] optional physical resolution
 * @param {number} [level] deflate level 0..9 (default 6)
 * @returns {Uint8Array} PNG file bytes
 */
function encodePNG(pixels, width, height, channels, dpi, level) {
  const colorType = channels === 2 ? 4 : 0;
  const stride = width * channels;
  // Filter type 1 (Sub) on every row: good for anti-aliased line art.
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const ro = y * (stride + 1);
    const so = y * stride;
    raw[ro] = 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[so + x - channels] : 0;
      raw[ro + 1 + x] = (pixels[so + x] - left) & 0xff;
    }
  }
  const idat = zlibSync(raw, {level: level === undefined || level === null ? 6 : level});

  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [chunk('IHDR', ihdr)];
  if (dpi) {
    const ppm = Math.round(dpi / 0.0254);
    const phys = new Uint8Array(9);
    writeU32(phys, 0, ppm);
    writeU32(phys, 4, ppm);
    phys[8] = 1;
    parts.push(chunk('pHYs', phys));
  }
  parts.push(chunk('IDAT', idat));
  parts.push(chunk('IEND', new Uint8Array(0)));

  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  let total = sig.length;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  out.set(sig, 0);
  let off = sig.length;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes) {
  let out = '';
  const n = bytes.length;
  let i = 0;
  const parts = [];
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
    if (out.length > 8192) {
      parts.push(out);
      out = '';
    }
  }
  if (i < n) {
    const v = (bytes[i] << 16) | ((i + 1 < n ? bytes[i + 1] : 0) << 8);
    out += B64[(v >> 18) & 63] + B64[(v >> 12) & 63];
    out += i + 1 < n ? B64[(v >> 6) & 63] : '=';
    out += '=';
  }
  parts.push(out);
  return parts.join('');
}

module.exports = {encodePNG, toBase64, crc32};
