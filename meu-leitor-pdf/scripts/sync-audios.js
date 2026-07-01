#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function syncAudios(sourceRoot, targetRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const unitFolders = entries.filter(e => e.isDirectory() && /^unit_\d+/i.test(e.name));
  if (unitFolders.length === 0) {
    console.warn('No unit_* folders found in', sourceRoot);
  }

  for (const uf of unitFolders) {
    const unitName = uf.name; // e.g. unit_1
    const srcUnit = path.join(sourceRoot, unitName);
    const destUnit = path.join(targetRoot, unitName);
    await ensureDir(destUnit);
    const files = await fs.readdir(srcUnit, { withFileTypes: true });
    const audioFiles = files
      .filter(f => f.isFile() && /\.(mp3|m4a|wav|ogg)$/i.test(f.name))
      .map(f => f.name);

    const manifest = [];
    for (const fileName of audioFiles) {
      const srcFile = path.join(srcUnit, fileName);
      const destFile = path.join(destUnit, fileName);
      try {
        await copyFile(srcFile, destFile);
        manifest.push(fileName);
        console.log(`Copied ${unitName}/${fileName}`);
      } catch (e) {
        console.error('Failed to copy', srcFile, e.message);
      }
    }

    // write manifest.json
    try {
      await fs.writeFile(path.join(destUnit, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
      console.log(`Wrote manifest for ${unitName} (${manifest.length} files)`);
    } catch (e) {
      console.error('Failed to write manifest for', unitName, e.message);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.log('Usage: node scripts/sync-audios.js <source-audio-root> [<target-public-audio-root>]');
    console.log('Example: node scripts/sync-audios.js "C:\\...\\EVIU_P_I" ./public/audio');
    process.exit(1);
  }
  const sourceRoot = path.resolve(argv[0]);
  const targetRoot = path.resolve(argv[1] || path.join(__dirname, '..', 'public', 'audio'));

  console.log('Source:', sourceRoot);
  console.log('Target:', targetRoot);

  try {
    await syncAudios(sourceRoot, targetRoot);
    console.log('Sync complete.');
  } catch (e) {
    console.error('Sync failed:', e.message);
    process.exit(2);
  }
}

main();
