const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

const targets = [
  { name: 'isa.webp', widths: [360, 600, 800] },
  { name: 'planilha folder.webp', widths: [360, 600, 800] },
  { name: 'ponto equilibrio.webp', widths: [360, 600, 800] },
  { name: 'fluxo caixa (1).webp', widths: [360, 600, 800] },
];

async function ensureWebpVariants(file, widths) {
  const inputPath = path.join(IMAGES_DIR, file);
  if (!fs.existsSync(inputPath)) {
    console.warn(`Skip missing: ${file}`);
    return;
  }
  for (const w of widths) {
    const base = file.replace(/\.webp$/i, '');
    const out = path.join(IMAGES_DIR, `${base}-${w}w.webp`);
    if (fs.existsSync(out)) {
      continue;
    }
    try {
      await sharp(inputPath, { limitInputPixels: false })
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(out);
      console.log(`Created: ${path.basename(out)}`);
    } catch (e) {
      console.error(`Failed: ${file} @ ${w} =>`, e.message);
    }
  }
}

(async () => {
  for (const t of targets) {
    await ensureWebpVariants(t.name, t.widths);
  }
  console.log('Done generating responsive images.');
})();
