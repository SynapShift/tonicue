const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const outDir = path.join(process.cwd(), 'src/assets');
fs.mkdirSync(outDir, { recursive: true });

const size = 256;
const pixels = Buffer.alloc(size * size * 4);

const colors = {
  transparent: [0, 0, 0, 0],
  mint: [117, 200, 179, 255],
  mintDark: [49, 137, 120, 255],
  cream: [255, 248, 239, 255],
  peach: [255, 179, 107, 255]
};

function setPixel(x, y, color) {
  if (x < 0 || x >= size || y < 0 || y >= size) {
    return;
  }
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fillRoundedRect(x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const dx = Math.max(x - px + radius, 0, px - (x + width - radius - 1));
      const dy = Math.max(y - py + radius, 0, py - (y + height - radius - 1));
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(px, py, color);
      }
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(x, y, color);
      }
    }
  }
}

function drawSmile(cx, cy, radius, thickness, color) {
  for (let angle = 22; angle <= 158; angle += 0.2) {
    const radians = (angle * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(radians) * radius);
    const y = Math.round(cy + Math.sin(radians) * radius);
    fillCircle(x, y, thickness, color);
  }
}

fillRoundedRect(20, 20, 216, 216, 58, colors.mint);
fillRoundedRect(28, 36, 200, 184, 50, [146, 221, 195, 255]);
fillCircle(88, 108, 18, colors.cream);
fillCircle(168, 108, 18, colors.cream);
fillCircle(92, 104, 7, colors.mintDark);
fillCircle(172, 104, 7, colors.mintDark);
drawSmile(128, 118, 58, 7, colors.cream);
fillCircle(60, 166, 12, colors.peach);
fillCircle(196, 166, 12, colors.peach);

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  const rows = [];
  for (let y = 0; y < size; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(pixels.subarray(y * size * 4, (y + 1) * size * 4));
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function makeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

const png = makePng();
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), makeIco(png));
console.log('Generated src/assets/icon.png and src/assets/icon.ico');
