// 의존성 없이 PWA 아이콘 PNG(192·512)를 만든다. public/icon.svg와 같은 그림:
// 파란 바탕의 흰 판을 넷으로 나눠 스도쿠·노노그램·가쿠로·지뢰찾기 무늬를 하나씩 넣는다.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const BG = [0x2f, 0x5b, 0xd3];
const WHITE = [0xff, 0xff, 0xff];
const INK = [0x1c, 0x22, 0x33];
const GOLD = [0xff, 0xd6, 0x66];
const GRAY = [0xc9, 0xcf, 0xdc];
const inRect = (x, y, x0, y0, w, h) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

/** 90×90 좌표의 한 점 색 (icon.svg와 같은 순서로 덧칠) */
function colorAt(x, y) {
  if (!inRect(x, y, 18, 18, 54, 54)) return BG;
  let px = WHITE;
  if (inRect(x, y, 27, 27, 9, 9)) px = GOLD;
  if (inRect(x, y, 45, 18, 27, 9) || inRect(x, y, 54, 27, 18, 9) || inRect(x, y, 45, 36, 9, 9)) px = INK;
  const inK1 = inRect(x, y, 18, 45, 13.5, 13.5);
  const inK2 = inRect(x, y, 31.5, 58.5, 13.5, 13.5);
  if (inK1 || inK2) px = Math.abs(x - 18 - (y - 45)) < 0.7 ? WHITE : INK;
  if (inRect(x, y, 45, 45, 27, 27)) {
    px = GRAY;
    const dx = x - 58.5;
    const dy = y - 58.5;
    if (dx * dx + dy * dy < 25 || (Math.abs(dx) < 1 && Math.abs(dy) < 8.5) || (Math.abs(dy) < 1 && Math.abs(dx) < 8.5)) px = INK;
  }
  if (Math.abs(x - 45) < 1 || Math.abs(y - 45) < 1) px = INK;
  if (x < 19 || y < 19 || x >= 71 || y >= 71) px = INK;
  return px;
}

function icon(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = colorAt(((x + 0.5) / size) * 90, ((y + 0.5) / size) * 90);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = px[0];
      raw[o + 1] = px[1];
      raw[o + 2] = px[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), icon(size));
}
console.log('icons written');
