#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

import jpeg from 'jpeg-js';
import BLPFile from 'js-blp';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const { MpqArchive } = require('stormlib-js');

const CONTINENTS = [
  {
    mapId: 0,
    label: 'Eastern Kingdoms',
    candidates: ['Azeroth', 'EasternKingdoms'],
  },
  {
    mapId: 1,
    label: 'Kalimdor',
    candidates: ['Kalimdor'],
  },
  {
    mapId: 530,
    label: 'Outland',
    candidates: ['Expansion01', 'Outland'],
  },
  {
    mapId: 571,
    label: 'Northrend',
    candidates: ['Northrend'],
  },
];

const DEFAULTS = {
  output: path.resolve(process.cwd(), 'assets/maps'),
  quality: 90,
  keepWorkspace: false,
};

function readNpmConfigValue(name) {
  const value = process.env[`npm_config_${name}`];
  if (value === undefined || value === '' || value === 'true') {
    return undefined;
  }
  return value;
}

function readNpmConfigBoolean(name) {
  const value = readNpmConfigValue(name);
  if (value === undefined) {
    return undefined;
  }
  return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
}

function printUsage() {
  console.log(`WoW Admin map extractor

Usage:
  npm run extract:maps -- --source /path/to/WoW
  npm run extract:maps -- --source /path/to/World/Minimaps
  npm run extract:maps --source /path/to/WoW

Options:
  --source, -s        WoW client root, Data dir, or extracted World/Minimaps dir
  --output, -o        Output directory for 0.jpg / 1.jpg / 530.jpg / 571.jpg
  --workspace, -w     Temp/work directory used while extracting MPQs
  --quality, -q       JPEG quality (1-100, default: 90)
  --keep-workspace    Keep extracted minimap tiles instead of deleting temp files
  --help, -h          Show this message

Notes:
  - A plain positional path is also accepted as the source for npm convenience.
  - npm config-style flags also work, e.g. npm run extract:maps --source /path --output ./maps.
  - If --source already contains World/Minimaps, the script stitches tiles directly.
  - If --source is a WoW 3.3.5a client, the script will try to extract World/Minimaps
    from MPQ archives using 7zz, 7z, or bsdtar if one is installed.
`);
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    source: readNpmConfigValue('source'),
    output: readNpmConfigValue('output') ?? DEFAULTS.output,
    workspace: readNpmConfigValue('workspace'),
    quality: Number.parseInt(readNpmConfigValue('quality') ?? String(DEFAULTS.quality), 10),
    keepWorkspace: readNpmConfigBoolean('keep_workspace') ?? DEFAULTS.keepWorkspace,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--source':
      case '-s':
        options.source = argv[++i];
        break;
      case '--output':
      case '-o':
        options.output = argv[++i];
        break;
      case '--workspace':
      case '-w':
        options.workspace = argv[++i];
        break;
      case '--quality':
      case '-q':
        options.quality = Number.parseInt(argv[++i] ?? '', 10);
        break;
      case '--keep-workspace':
        options.keepWorkspace = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        positional.push(arg);
        break;
    }
  }

  if (!options.source && positional.length > 0) {
    [options.source] = positional;
  }
  if ((options.output === DEFAULTS.output || !options.output) && positional.length > 1) {
    [, options.output] = positional;
  }
  if (!options.workspace && positional.length > 2) {
    [, , options.workspace] = positional;
  }
  if ((options.quality === DEFAULTS.quality || Number.isNaN(options.quality)) && positional.length > 3) {
    options.quality = Number.parseInt(positional[3], 10);
  }

  if (positional.length > 4) {
    throw new Error(`Unexpected extra positional arguments: ${positional.slice(4).join(', ')}`);
  }

  if (options.output) {
    options.output = path.resolve(process.cwd(), options.output);
  }
  if (options.workspace) {
    options.workspace = path.resolve(process.cwd(), options.workspace);
  }
  if (options.source) {
    options.source = path.resolve(process.cwd(), options.source);
  }

  return options;
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exitCode = 1;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeName(name) {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function locateMinimapRoot(sourcePath) {
  const directCandidates = [
    sourcePath,
    path.join(sourcePath, 'World', 'Minimaps'),
    path.join(sourcePath, 'world', 'minimaps'),
    path.join(sourcePath, 'Data', 'World', 'Minimaps'),
    path.join(sourcePath, 'Data', 'world', 'minimaps'),
    path.join(sourcePath, 'data', 'World', 'Minimaps'),
    path.join(sourcePath, 'data', 'world', 'minimaps'),
  ];

  for (const candidate of directCandidates) {
    if (!pathExists(candidate)) {
      continue;
    }

    const stat = fs.statSync(candidate);
    if (!stat.isDirectory()) {
      continue;
    }

    const baseName = path.basename(candidate).toLowerCase();
    const parentName = path.basename(path.dirname(candidate)).toLowerCase();
    if (baseName === 'minimaps' && parentName === 'world') {
      return candidate;
    }
  }

  return null;
}

function locateDataDir(sourcePath) {
  const candidates = [
    sourcePath,
    path.join(sourcePath, 'Data'),
    path.join(sourcePath, 'data'),
  ];

  for (const candidate of candidates) {
    if (path.basename(candidate).toLowerCase() !== 'data') {
      continue;
    }
    if (pathExists(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

function findExtractionTool() {
  const candidates = ['7zz', '7z', 'bsdtar'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--help'], { stdio: 'ignore' });
    if (!probe.error) {
      return candidate;
    }
  }
  return null;
}

function canListMpqArchive(tool, archivePath) {
  if (tool === 'bsdtar') {
    const result = spawnSync(tool, ['-tf', archivePath], { encoding: 'utf8' });
    return !result.error && result.status === 0;
  }

  const result = spawnSync(tool, ['l', archivePath], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function archivePriority(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (/^common.*\.mpq$/.test(name)) return 10;
  if (/^common-2.*\.mpq$/.test(name)) return 15;
  if (/^expansion.*\.mpq$/.test(name)) return 20;
  if (/^lichking.*\.mpq$/.test(name)) return 25;
  if (/^locale-.*\.mpq$/.test(name)) return 30;
  if (/^patch-.*\.mpq$/.test(name)) return 50;
  return 40;
}

function findMpqArchives(dataDir) {
  const archives = [];
  const entries = walkFiles(dataDir);
  for (const entry of entries) {
    if (/\.mpq$/i.test(entry)) {
      archives.push(entry);
    }
  }

  archives.sort((a, b) => {
    const priorityDiff = archivePriority(a) - archivePriority(b);
    return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
  });

  return archives;
}

function isTopLevelDataArchive(archivePath, dataDir) {
  return path.dirname(archivePath) === dataDir;
}

function extractMpqFile(archive, fileNames) {
  for (const fileName of fileNames) {
    try {
      return archive.extractFile(fileName);
    } catch {
      // keep trying alternate path forms
    }
  }
  return null;
}

function parseMd5TranslateTable(buffer) {
  const text = buffer.toString('utf8');
  const byDirectory = new Map();
  let currentDirectory = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('dir: ')) {
      currentDirectory = line.slice(5).trim();
      if (!byDirectory.has(currentDirectory)) {
        byDirectory.set(currentDirectory, new Map());
      }
      continue;
    }

    if (!currentDirectory) {
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      continue;
    }

    const logicalPath = parts[0].replace(/\\/g, '/');
    const hashedName = parts[1];
    const logicalName = logicalPath.split('/').pop();
    if (!logicalName) {
      continue;
    }

    byDirectory.get(currentDirectory).set(logicalName, hashedName);
  }

  return byDirectory;
}

function canDecodeBlp(buffer) {
  try {
    const blp = new BLPFile(buffer);
    blp.getPixels(0);
    return true;
  } catch {
    return false;
  }
}

function tryExtractMinimapsWithStormlib(dataDir, archives, workspaceDir) {
  const topLevelArchives = archives.filter((archivePath) => isTopLevelDataArchive(archivePath, dataDir));
  if (topLevelArchives.length === 0) {
    return null;
  }

  const openedArchives = [];
  try {
    for (const archivePath of topLevelArchives) {
      try {
        openedArchives.push({
          archivePath,
          archive: MpqArchive.open(archivePath),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`  ! Skipping ${path.basename(archivePath)} for built-in MPQ extraction: ${errorMessage}`);
      }
    }

    if (openedArchives.length === 0) {
      return null;
    }

    let trsBuffer = null;
    for (const { archive } of openedArchives) {
      trsBuffer = extractMpqFile(archive, [
        'textures\\Minimap\\md5translate.trs',
        'textures/minimap/md5translate.trs',
        'Textures\\Minimap\\md5translate.trs',
        'Textures/Minimap/md5translate.trs',
      ]);
      if (trsBuffer) {
        break;
      }
    }

    if (!trsBuffer) {
      return null;
    }

    const minimapIndex = new Map();
    for (const openedArchive of openedArchives) {
      const names = openedArchive.archive.getFileList();
      for (const name of names) {
        if (/^textures\\minimap\\[0-9a-f]{32}\.blp$/i.test(name)) {
          const key = name.toLowerCase();
          if (!minimapIndex.has(key)) {
            minimapIndex.set(key, []);
          }
          minimapIndex.get(key).push({
            archive: openedArchive.archive,
            fileName: name,
            archivePath: openedArchive.archivePath,
          });
        }
      }
    }

    const byDirectory = parseMd5TranslateTable(trsBuffer);
    const minimapRoot = path.join(workspaceDir, 'World', 'Minimaps');
    let extractedCount = 0;

    for (const continent of CONTINENTS) {
      const directoryName = continent.candidates.find((candidate) => byDirectory.has(candidate));
      if (!directoryName) {
        continue;
      }

      const targetDir = path.join(minimapRoot, directoryName);
      ensureDir(targetDir);
      const tiles = byDirectory.get(directoryName);

      for (const [logicalName, hashedName] of tiles.entries()) {
        const minimapKey = `textures\\minimap\\${hashedName}`.toLowerCase();
        const candidates = minimapIndex.get(minimapKey);
        if (!candidates || candidates.length === 0) {
          continue;
        }

        let selectedData = null;
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
          const candidate = candidates[index];
          const data = extractMpqFile(candidate.archive, [candidate.fileName]);
          if (!data) {
            continue;
          }
          if (/\.blp$/i.test(logicalName) && !canDecodeBlp(data)) {
            console.warn(`  ! Skipping corrupt tile ${logicalName} from ${path.basename(candidate.archivePath)}`);
            continue;
          }
          selectedData = data;
          break;
        }

        if (!selectedData) {
          continue;
        }

        fs.writeFileSync(path.join(targetDir, logicalName), selectedData);
        extractedCount += 1;
      }

      console.log(`  ✓ ${directoryName}: ${tiles.size} tile mapping(s) processed`);
    }

    if (extractedCount === 0) {
      return null;
    }

    console.log(`• Extracted ${extractedCount} minimap tile(s) directly from MPQ archives`);
    return locateMinimapRoot(workspaceDir);
  } finally {
    for (const { archive } of openedArchives) {
      try {
        archive.close();
      } catch {
        // ignore close failures
      }
    }
  }
}

function runExtraction(tool, archivePath, workspaceDir) {
  if (tool === 'bsdtar') {
    return spawnSync(tool, [
      '-xf',
      archivePath,
      '-C',
      workspaceDir,
      '--wildcards',
      'World/Minimaps/*',
      'world/minimaps/*',
    ], {
      encoding: 'utf8',
    });
  }

  return spawnSync(tool, [
    'x',
    archivePath,
    'World\\Minimaps\\*',
    'world\\minimaps\\*',
    `-o${workspaceDir}`,
    '-y',
  ], {
    encoding: 'utf8',
  });
}

function extractMinimapsFromMpqs(sourcePath, workspaceDir) {
  const dataDir = locateDataDir(sourcePath);
  if (!dataDir) {
    return null;
  }

  const archives = findMpqArchives(dataDir);
  if (archives.length === 0) {
    throw new Error(`No MPQ archives were found under ${dataDir}.`);
  }

  ensureDir(workspaceDir);

  const stormlibRoot = tryExtractMinimapsWithStormlib(dataDir, archives, workspaceDir);
  if (stormlibRoot) {
    return stormlibRoot;
  }

  const tool = findExtractionTool();
  if (!tool) {
    throw new Error('No usable built-in minimap extraction path was found, and no external archive extractor is available. Install a tool that can read WoW MPQ archives (recommended: 7zz), or point --source at an already extracted World/Minimaps directory.');
  }

  const probeArchive = archives[0];
  if (!canListMpqArchive(tool, probeArchive)) {
    throw new Error(
      `${tool} is installed but cannot read WoW MPQ archives on this system (${path.basename(probeArchive)} failed to open). ` +
      'The built-in MPQ reader also could not resolve usable minimap tiles from this client layout. Install 7zz, or extract World/Minimaps manually and point --source at that extracted folder.'
    );
  }

  console.log(`• Using ${tool} to extract minimaps from ${archives.length} MPQ archive(s)...`);
  let extractedAnything = false;

  for (const archive of archives) {
    const result = runExtraction(tool, archive, workspaceDir);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    const hasNoMatch = /No files to process|No such file|Cannot find archive|There is no such archive/i.test(output);

    if (result.error) {
      console.warn(`  ! Skipped ${path.basename(archive)}: ${result.error.message}`);
      continue;
    }

    if (result.status === 0) {
      extractedAnything = true;
      console.log(`  ✓ ${path.basename(archive)}`);
      continue;
    }

    if (hasNoMatch) {
      continue;
    }

    console.warn(`  ! ${path.basename(archive)} returned exit code ${result.status}.`);
  }

  if (!extractedAnything) {
    console.warn('  ! No archive reported extracted files. Checking the workspace anyway...');
  }

  return locateMinimapRoot(workspaceDir);
}

function findContinentFolder(minimapRoot, candidateNames) {
  const entries = fs.readdirSync(minimapRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const normalizedToEntry = new Map(entries.map((entry) => [normalizeName(entry.name), entry.name]));

  for (const candidate of candidateNames) {
    const match = normalizedToEntry.get(normalizeName(candidate));
    if (match) {
      return path.join(minimapRoot, match);
    }
  }

  return null;
}

function parseTileCoordinates(filePath) {
  const name = path.basename(filePath, path.extname(filePath));
  const patterns = [
    /(?:^|_)(\d{1,3})_(\d{1,3})$/i,
    /^map(\d{1,3})_(\d{1,3})$/i,
    /^[a-z0-9]+_(\d{1,3})_(\d{1,3})$/i,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return {
        tileX: Number.parseInt(match[1], 10),
        tileY: Number.parseInt(match[2], 10),
      };
    }
  }

  return null;
}

function decodeImage(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (extension === '.blp') {
    const blp = new BLPFile(buffer);
    const pixels = blp.getPixels(0);
    return {
      width: blp.width,
      height: blp.height,
      data: Buffer.from(pixels.raw),
    };
  }

  if (extension === '.png') {
    const png = PNG.sync.read(buffer);
    return {
      width: png.width,
      height: png.height,
      data: Buffer.from(png.data),
    };
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    const jpg = jpeg.decode(buffer, { useTArray: true });
    return {
      width: jpg.width,
      height: jpg.height,
      data: Buffer.from(jpg.data),
    };
  }

  throw new Error(`Unsupported image format: ${filePath}`);
}

function collectTiles(folderPath) {
  const files = walkFiles(folderPath)
    .filter((filePath) => /\.(blp|png|jpe?g)$/i.test(filePath))
    .sort((a, b) => a.localeCompare(b));

  const tiles = [];
  for (const filePath of files) {
    const coords = parseTileCoordinates(filePath);
    if (!coords) {
      continue;
    }
    tiles.push({
      ...coords,
      filePath,
    });
  }

  return tiles;
}

function blitTile(target, targetWidth, targetHeight, tileData, tileWidth, tileHeight, offsetX, offsetY) {
  for (let y = 0; y < tileHeight; y += 1) {
    const destY = offsetY + y;
    if (destY < 0 || destY >= targetHeight) {
      continue;
    }

    for (let x = 0; x < tileWidth; x += 1) {
      const destX = offsetX + x;
      if (destX < 0 || destX >= targetWidth) {
        continue;
      }

      const sourceIndex = (y * tileWidth + x) * 4;
      const targetIndex = (destY * targetWidth + destX) * 4;

      target[targetIndex] = tileData[sourceIndex];
      target[targetIndex + 1] = tileData[sourceIndex + 1];
      target[targetIndex + 2] = tileData[sourceIndex + 2];
      target[targetIndex + 3] = tileData[sourceIndex + 3];
    }
  }
}

function stitchContinent(folderPath, continent, outputDir, quality) {
  const tiles = collectTiles(folderPath);
  if (tiles.length === 0) {
    throw new Error(`No tile files were found under ${folderPath}.`);
  }

  let minTileX = Number.POSITIVE_INFINITY;
  let minTileY = Number.POSITIVE_INFINITY;
  let maxTileX = Number.NEGATIVE_INFINITY;
  let maxTileY = Number.NEGATIVE_INFINITY;

  const decodedTiles = [];
  for (const tile of tiles) {
    try {
      const image = decodeImage(tile.filePath);
      minTileX = Math.min(minTileX, tile.tileX);
      minTileY = Math.min(minTileY, tile.tileY);
      maxTileX = Math.max(maxTileX, tile.tileX);
      maxTileY = Math.max(maxTileY, tile.tileY);
      decodedTiles.push({
        ...tile,
        ...image,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`  ! Skipping unreadable tile ${path.basename(tile.filePath)}: ${errorMessage}`);
    }
  }

  if (decodedTiles.length === 0) {
    throw new Error(`No readable tile files were found under ${folderPath}.`);
  }

  const tileWidth = decodedTiles[0].width;
  const tileHeight = decodedTiles[0].height;

  for (const tile of decodedTiles) {
    if (tile.width !== tileWidth || tile.height !== tileHeight) {
      throw new Error(`Mixed tile sizes were found in ${folderPath}.`);
    }
  }

  const outputWidth = (maxTileX - minTileX + 1) * tileWidth;
  const outputHeight = (maxTileY - minTileY + 1) * tileHeight;
  const rgba = Buffer.alloc(outputWidth * outputHeight * 4, 0);

  for (const tile of decodedTiles) {
    const offsetX = (tile.tileX - minTileX) * tileWidth;
    const offsetY = (tile.tileY - minTileY) * tileHeight;
    blitTile(rgba, outputWidth, outputHeight, tile.data, tile.width, tile.height, offsetX, offsetY);
  }

  const encoded = jpeg.encode({ data: rgba, width: outputWidth, height: outputHeight }, quality);
  const outputPath = path.join(outputDir, `${continent.mapId}.jpg`);
  fs.writeFileSync(outputPath, encoded.data);

  return {
    outputPath,
    tileCount: decodedTiles.length,
    width: outputWidth,
    height: outputHeight,
    minTileX,
    minTileY,
    maxTileX,
    maxTileY,
    folderPath,
  };
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    printUsage();
    return;
  }

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.source) {
    fail('Missing required --source argument.');
    printUsage();
    return;
  }

  if (!pathExists(options.source) || !fs.statSync(options.source).isDirectory()) {
    fail(`Source path does not exist or is not a directory: ${options.source}`);
    return;
  }

  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) {
    fail(`JPEG quality must be an integer between 1 and 100. Received: ${options.quality}`);
    return;
  }

  ensureDir(options.output);

  let workspaceDir = options.workspace;
  let tempWorkspaceCreated = false;
  let minimapRoot = locateMinimapRoot(options.source);

  if (minimapRoot) {
    console.log(`• Found extracted minimaps at ${minimapRoot}`);
  } else {
    workspaceDir = workspaceDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'wow-admin-minimaps-'));
    tempWorkspaceCreated = !options.workspace;
    minimapRoot = extractMinimapsFromMpqs(options.source, workspaceDir);
    if (!minimapRoot) {
      throw new Error('Unable to find World/Minimaps after extraction. Point --source at an extracted minimap directory or verify your WoW client data files.');
    }
    console.log(`• Extracted minimaps into ${minimapRoot}`);
  }

  const summaries = [];

  for (const continent of CONTINENTS) {
    const folderPath = findContinentFolder(minimapRoot, continent.candidates);
    if (!folderPath) {
      console.warn(`! Skipping ${continent.label}: could not find a minimap folder matching ${continent.candidates.join(', ')}`);
      continue;
    }

    console.log(`• Stitching ${continent.label} from ${path.basename(folderPath)}...`);
    const summary = stitchContinent(folderPath, continent, options.output, options.quality);
    summaries.push({ continent, ...summary });
    console.log(`  ✓ Wrote ${path.basename(summary.outputPath)} (${summary.width}×${summary.height}, ${summary.tileCount} tiles)`);
  }

  if (summaries.length === 0) {
    throw new Error('No continent maps were produced. Check the extracted minimap folder names and tile naming format.');
  }

  console.log('\nDone. Generated continent maps:');
  for (const summary of summaries) {
    console.log(`  - ${summary.continent.label}: ${summary.outputPath}`);
  }

  if (workspaceDir && (options.keepWorkspace || options.workspace)) {
    console.log(`\nWorkspace retained at: ${workspaceDir}`);
  } else if (workspaceDir && (tempWorkspaceCreated || !options.keepWorkspace)) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
