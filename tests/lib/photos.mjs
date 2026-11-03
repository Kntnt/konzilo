// Images the converter suite and the acceptance suite draw themselves, so
// that no test holds a real photo: a photo as a phone takes it, plain images
// of a given size, and files in the formats the site refuses. Each suite
// passes in its own copy of sharp, pinned as Astro pins it.
//
// The phone photo is a picture of four coloured quarters, stored on its side
// with an EXIF orientation that turns it upright, in Display P3, with a GPS
// position, the camera's make and model, an IPTC caption and credit, and
// XMP: everything a master must turn upright, convert or leave out.

// The upright picture's quarters, as sRGB colours.
export const QUARTERS = {
  topLeft: [255, 0, 0],
  topRight: [0, 255, 0],
  bottomLeft: [0, 0, 255],
  bottomRight: [255, 255, 255],
};

// The texts the photo's metadata holds, which no master may hold.
export const METADATA = {
  make: 'Konzilo Test Camera',
  model: 'Phone 4032',
  caption: 'Konzilo test caption',
  credit: 'Konzilo test credit',
  creator: 'Konzilo test creator',
  latitude: [57, 42, 30],
  longitude: [11, 58, 15],
};

// A JPEG as a phone takes it: `width` × `height` upright (portrait by
// default, as a phone held upright), stored turned a quarter to the left with
// EXIF orientation 6, which turns it right again.
export async function phonePhoto(sharp, { width = 3024, height = 4032, quality = 90 } = {}) {
  const raw = await quarters(sharp, width, height).raw().toBuffer({ resolveWithObject: true });
  const stored = await sharp(raw.data, { raw: raw.info })
    .rotate(-90)
    .withIccProfile('p3')
    .jpeg({ quality })
    .toBuffer();
  return withSegments(stored, [
    segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exif()])),
    segment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xmp(), 'utf8')])),
    segment(0xed, iptc()),
  ]);
}

// An image of the four quarters, `width` × `height`, upright and in sRGB
// without a profile, in a format sharp writes: jpeg, png, webp, gif or tiff.
export async function plainImage(sharp, { width, height, format = 'png' }) {
  return quarters(sharp, width, height).toFormat(format).toBuffer();
}

// An animated WebP of two frames, which the site refuses: a master would keep
// only the first.
export async function animatedWebp(sharp, { width = 800, height = 600 } = {}) {
  const frame = (r, g, b) => sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).raw().toBuffer();
  const frames = Buffer.concat([await frame(255, 0, 0), await frame(0, 0, 255)]);
  return sharp(frames, { raw: { width, height: height * 2, channels: 3, pageHeight: height } })
    .webp({ loop: 0, delay: [500, 500] })
    .toBuffer();
}

// The start of a HEIC file, as an iPhone writes it: enough to be known by
// its signature, which is all the site reads before it refuses it.
export function heicFile() {
  const box = Buffer.alloc(24);
  box.writeUInt32BE(24, 0);
  box.write('ftypheic', 4, 'latin1');
  box.writeUInt32BE(0, 12);
  box.write('mif1heic', 16, 'latin1');
  return Buffer.concat([box, Buffer.alloc(1000)]);
}

// An uncompressed 24-bit BMP of one colour.
export function bmpFile(width = 1600, height = 1200) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const file = Buffer.alloc(54 + row * height);
  file.write('BM', 0, 'latin1');
  file.writeUInt32LE(file.length, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(row * height, 34);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) file[54 + y * row + x * 3 + 2] = 255;
  return file;
}

// The colour at the middle of each quarter of an image, as sRGB, upright as
// sharp decodes it after turning it by its EXIF orientation.
export async function quarterColours(sharp, bytes) {
  const { data, info } = await sharp(bytes).autoOrient().toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (fx, fy) => {
    const offset = (Math.floor(info.height * fy) * info.width + Math.floor(info.width * fx)) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };
  return { topLeft: at(0.25, 0.25), topRight: at(0.75, 0.25), bottomLeft: at(0.25, 0.75), bottomRight: at(0.75, 0.75) };
}

// Whether two colours are alike within a tolerance per channel, as lossy
// encoding leaves them.
export function alike(colour, expected, tolerance = 8) {
  return colour.every((value, i) => Math.abs(value - expected[i]) <= tolerance);
}

// The chunks of a WebP file, by their FourCC: `VP8 ` alone for an opaque
// picture without metadata; `EXIF`, `XMP ` and `ICCP` hold metadata.
export function webpChunks(bytes) {
  if (bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const chunks = [];
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    chunks.push(bytes.toString('latin1', offset, offset + 4));
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

function quarters(sharp, width, height) {
  const [w, h] = [Math.floor(width / 2), Math.floor(height / 2)];
  const block = ([r, g, b]) => ({ create: { width: w, height: h, channels: 3, background: { r, g, b } } });
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } }).composite([
    { input: block(QUARTERS.topLeft), left: 0, top: 0 },
    { input: block(QUARTERS.topRight), left: width - w, top: 0 },
    { input: block(QUARTERS.bottomLeft), left: 0, top: height - h },
  ]);
}

// A JPEG with the given marker segments put right after its start, before
// what the encoder wrote (its ICC profile among it).
function withSegments(jpeg, segments) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG file');
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

function segment(marker, payload) {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

// EXIF as TIFF, little-endian: the first IFD with the camera's make and
// model, the orientation 6 and a pointer to the GPS IFD, which holds a
// position.
function exif() {
  const ascii = (text) => ({ type: 2, data: Buffer.from(`${text}\0`, 'latin1') });
  const short = (value) => { const data = Buffer.alloc(2); data.writeUInt16LE(value); return { type: 3, data }; };
  const long = (value) => { const data = Buffer.alloc(4); data.writeUInt32LE(value); return { type: 4, data }; };
  const rationals = (values) => {
    const data = Buffer.alloc(8 * values.length);
    values.forEach((value, i) => { data.writeUInt32LE(value, 8 * i); data.writeUInt32LE(1, 8 * i + 4); });
    return { type: 5, data };
  };
  const bytes = (values) => ({ type: 1, data: Buffer.from(values) });

  const gps = [
    [0x0000, bytes([2, 3, 0, 0])],
    [0x0001, ascii('N')],
    [0x0002, rationals(METADATA.latitude)],
    [0x0003, ascii('E')],
    [0x0004, rationals(METADATA.longitude)],
  ];
  const first = (gpsOffset) => [
    [0x010f, ascii(METADATA.make)],
    [0x0110, ascii(METADATA.model)],
    [0x0112, short(6)],
    [0x8825, long(gpsOffset)],
  ];
  // The first IFD at 8, the GPS IFD after it and its data.
  const firstSize = ifdSize(first(0));
  const gpsOffset = 8 + firstSize;
  const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  return Buffer.concat([head, ifd(first(gpsOffset), 8), ifd(gps, gpsOffset)]);
}

const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };

function ifdSize(entries) {
  const outside = entries.reduce((sum, [, { data }]) => sum + (data.length > 4 ? data.length + (data.length % 2) : 0), 0);
  return 2 + 12 * entries.length + 4 + outside;
}

// One IFD at `offset` in the TIFF data: its entries, the offset of no next
// IFD, then the values that do not fit in an entry.
function ifd(entries, offset) {
  const table = Buffer.alloc(2 + 12 * entries.length + 4);
  table.writeUInt16LE(entries.length, 0);
  const values = [];
  let next = offset + table.length;
  entries.forEach(([tag, { type, data }], i) => {
    const at = 2 + 12 * i;
    table.writeUInt16LE(tag, at);
    table.writeUInt16LE(type, at + 2);
    table.writeUInt32LE(data.length / typeSize[type], at + 4);
    if (data.length <= 4) {
      data.copy(table, at + 8);
    } else {
      table.writeUInt32LE(next, at + 8);
      const padded = data.length % 2 ? Buffer.concat([data, Buffer.alloc(1)]) : data;
      values.push(padded);
      next += padded.length;
    }
  });
  return Buffer.concat([table, ...values]);
}

function xmp() {
  return '<?xpacket begin="\u{feff}" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">'
    + `<dc:creator><rdf:Seq><rdf:li>${METADATA.creator}</rdf:li></rdf:Seq></dc:creator>`
    + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

// IPTC as Photoshop keeps it in APP13: one 8BIM resource 0x0404 holding the
// IPTC records, a caption (2:120) and a credit (2:110).
function iptc() {
  const record = (dataset, value) => {
    const data = Buffer.from(value, 'latin1');
    const head = Buffer.from([0x1c, 2, dataset, 0, 0]);
    head.writeUInt16BE(data.length, 3);
    return Buffer.concat([head, data]);
  };
  const records = Buffer.concat([
    Buffer.from([0x1c, 2, 0, 0, 2, 0, 4]),
    record(120, METADATA.caption),
    record(110, METADATA.credit),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(records.length);
  const resource = Buffer.concat([Buffer.from('8BIM', 'latin1'), Buffer.from([0x04, 0x04, 0, 0]), size, records]);
  const padded = records.length % 2 ? Buffer.concat([resource, Buffer.alloc(1)]) : resource;
  return Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), padded]);
}
