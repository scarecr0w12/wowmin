const esbuild = require('esbuild');
const path = require('path');

const isDev = process.argv.includes('--watch');

// Main process build config
const mainConfig = {
  entryPoints: [path.join(__dirname, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/main.js',
  // Keep native / platform-specific runtime dependencies external so CI builds
  // do not try to inline optional binaries that vary across runners.
  external: ['electron', 'mysql2', 'electron-store', 'ssh2', 'xml2js'],
  sourcemap: true,
  minify: !isDev,
  format: 'cjs',
};

// Preload script build config
const preloadConfig = {
  entryPoints: [path.join(__dirname, 'src/preload.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/preload.js',
  external: ['electron'],
  sourcemap: true,
  minify: !isDev,
  format: 'cjs',
};

// Renderer build config
const rendererConfig = {
  entryPoints: [path.join(__dirname, 'renderer/scripts/app.ts')],
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  outfile: 'dist/renderer.js',
  sourcemap: true,
  minify: !isDev,
  format: 'iife',
};

async function build() {
  try {
    await Promise.all([
      esbuild.build(mainConfig),
      esbuild.build(preloadConfig),
      esbuild.build(rendererConfig),
    ]);
    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

async function watch() {
  const contexts = await Promise.all([
    esbuild.context(mainConfig),
    esbuild.context(preloadConfig),
    esbuild.context(rendererConfig),
  ]);

  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log('Watching for changes...');
}

if (isDev) {
  watch();
} else {
  build();
}
