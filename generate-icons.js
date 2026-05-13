/**
 * 產生最小有效的 PNG 圖示（純色方塊）
 * 執行：node generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  function makeChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcData = Buffer.concat([typeBytes, data]);
    const crc = crc32(crcData);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, typeBytes, data, crcBuf]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);   // width
  ihdrData.writeUInt32BE(size, 4);   // height
  ihdrData[8] = 8;                   // bit depth
  ihdrData[9] = 2;                   // color type: RGB
  ihdrData[10] = 0;                  // compression
  ihdrData[11] = 0;                  // filter
  ihdrData[12] = 0;                  // interlace

  // Raw image data: each row = filter byte (0) + RGB pixels
  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      rawData[offset + 1 + x * 3] = r;
      rawData[offset + 2 + x * 3] = g;
      rawData[offset + 3 + x * 3] = b;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const iconDir = path.join(__dirname, 'extension', 'public', 'icons');
fs.mkdirSync(iconDir, { recursive: true });

// Bilibili 粉紅色 #fb7299 → RGB(251, 114, 153)
const [r, g, b] = [251, 114, 153];

for (const size of [16, 48, 128]) {
  const png = createPNG(size, r, g, b);
  const dest = path.join(iconDir, `icon${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`✓ 產生 ${dest}`);
}

console.log('圖示產生完成');
