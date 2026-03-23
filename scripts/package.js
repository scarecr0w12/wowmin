const { spawnSync } = require('node:child_process');

const builderArgs = process.argv.slice(2);

if (process.platform === 'win32') {
  builderArgs.push('--config.win.signAndEditExecutable=false');
}

const result = spawnSync('npx', ['electron-builder', ...builderArgs], {
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
