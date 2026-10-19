// Decodes a JPEG with jpeg-js (the decoder the gates use) and writes: u32 width, u32 height, RGBA bytes.
import fs from 'node:fs';
import jpeg from 'jpeg-js';

const im = jpeg.decode(fs.readFileSync(process.argv[2]), { useTArray: true });
const head = Buffer.alloc(8);
head.writeUInt32LE(im.width, 0);
head.writeUInt32LE(im.height, 4);
process.stdout.write(Buffer.concat([head, Buffer.from(im.data)]));
