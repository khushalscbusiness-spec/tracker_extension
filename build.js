// build.js
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');

console.log('🏗️  Building JobPulse Extension...');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Build content scripts
const buildOptions = {
  entryPoints: ['src/content/bundle.js'],
  bundle: true,
  outfile: 'dist/src/content/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome90'],
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  external: ['chrome'],
};

if (isWatch) {
  console.log('👀 Watching for changes...');
  const context = await esbuild.context(buildOptions);
  await context.watch();
} else {
  await esbuild.build(buildOptions);
  console.log('✅ Content scripts bundled!');

  // Copy other files
  copyFiles();
}

function copyFiles() {
  console.log('📦 Copying files...');

  // Create dist directories
  const dirs = ['icons', 'config', 'src/api', 'src/background', 'src/popup', 'src/state', 'src/utils'];
  for (const dir of dirs) {
    const destPath = `dist/${dir}`;
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
  }

  // Copy icons
  if (fs.existsSync('icons')) {
    fs.cpSync('icons', 'dist/icons', { recursive: true });
  }

  // Copy config
  if (fs.existsSync('config')) {
    fs.cpSync('config', 'dist/config', { recursive: true });
  }

  // Copy src files (excluding content which we already bundled)
  const srcDirs = ['api', 'background', 'popup', 'state', 'utils'];
  for (const dir of srcDirs) {
    const srcPath = `src/${dir}`;
    const destPath = `dist/src/${dir}`;
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    }
  }

  // Copy manifest.json
  fs.copyFileSync('manifest.json', 'dist/manifest.json');

  // Copy README
  if (fs.existsSync('README.md')) {
    fs.copyFileSync('README.md', 'dist/README.md');
  }

  console.log('✅ Files copied!');
}