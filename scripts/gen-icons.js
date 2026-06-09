// One-off: generate PWA icons from the full-res source mark.
// Run: node scripts/gen-icons.js
// Uses jimp-compact (pure JS) so there's no native build dependency.
const path = require('path');
const Jimp = require('jimp-compact');

const ICONS = path.join(__dirname, '..', 'public', 'icons');
const SRC = path.join(ICONS, 'icon-512.png'); // current full-res 1024x1024 source

(async () => {
  const src = await Jimp.read(SRC);

  // Plain "any" icons + apple touch icon are straight resizes — the mark
  // already has its indigo background filling the square.
  const square = async (size, name) => {
    await src.clone().resize(size, size).writeAsync(path.join(ICONS, name));
    console.log(`  ${name} (${size}x${size})`);
  };

  // Maskable: the logo must stay inside the inner 80% "safe zone" so no
  // launcher mask (circle/squircle) clips the baton tips. Sample the corner
  // for the exact background, fill a 512 canvas with it, and drop the mark in
  // at ~84% so it has clearance on every side.
  const maskable = async () => {
    const SIZE = 512;
    const INNER = Math.round(SIZE * 0.84); // 430px — logo content well within safe circle
    const bg = src.getPixelColor(0, 0);    // exact indigo from the source corner
    const canvas = new Jimp(SIZE, SIZE, bg);
    const mark = src.clone().resize(INNER, INNER);
    const offset = Math.round((SIZE - INNER) / 2);
    canvas.composite(mark, offset, offset);
    await canvas.writeAsync(path.join(ICONS, 'icon-maskable-512.png'));
    console.log(`  icon-maskable-512.png (512x512, mark @ ${INNER}px safe-zone)`);
  };

  console.log('Generating icons:');
  await square(192, 'icon-192.png');
  await square(512, 'icon-512.png');
  await square(180, 'apple-touch-icon.png');
  await maskable();
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
