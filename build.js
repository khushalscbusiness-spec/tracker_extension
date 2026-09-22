// build.js
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');
const BUILD_ENV = process.env.NODE_ENV || 'development';
const isProduction = BUILD_ENV === 'production';

console.log(`🏗️  Building JobPulse Extension (${BUILD_ENV})...`);

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// ============================================
// ENV RESOLUTION
// At build time, intercept imports of './env/active.js' and redirect
// them to the correct env file. The source never names an env.
// ============================================

const ENV_FILE_MAP = {
  development: 'development.js',
  staging: 'staging.js',
  production: 'production.js'
};

if (!ENV_FILE_MAP[BUILD_ENV]) {
  console.error(`❌ Unknown BUILD_ENV: ${BUILD_ENV}`);
  console.error(`   Expected one of: ${Object.keys(ENV_FILE_MAP).join(', ')}`);
  process.exit(1);
}

const activeEnvFile = ENV_FILE_MAP[BUILD_ENV];
console.log(`🎯 Active env file: env/${activeEnvFile}`);

/**
 * esbuild plugin: intercept any import path ending in './env/active.js'
 * and redirect it to './env/<BUILD_ENV>.js'.
 *
 * This keeps the source env-neutral — nothing in src/ names a specific env.
 */
const envAliasPlugin = {
  name: 'env-alias',
  setup(build) {
    build.onResolve({ filter: /\/env\/active\.js$/ }, (args) => {
      const replaced = args.path.replace(/\/env\/active\.js$/, `/env/${activeEnvFile}`);
      const absolutePath = path.resolve(args.resolveDir, replaced);
      return { path: absolutePath, external: false };
    });
  }
};

// ============================================
// BUILD OPTIONS
// ============================================

// Content script — IIFE (runs in page context, no module support)
const contentBuildOptions = {
  entryPoints: ['src/content/bundle.js'],
  bundle: true,
  outfile: 'dist/src/content/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome90'],
  minify: isProduction,
  sourcemap: !isProduction,
  logLevel: 'info',
  external: ['chrome'],
  plugins: [envAliasPlugin],
  define: {
    BUILD_ENV: JSON.stringify(BUILD_ENV)
  }
};

// Service worker — ESM (MV3 requires "type": "module")
const serviceWorkerBuildOptions = {
  entryPoints: ['src/background/service-worker.js'],
  bundle: true,
  outfile: 'dist/src/background/service-worker.js',
  format: 'esm',
  platform: 'browser',
  target: ['chrome90'],
  minify: isProduction,
  sourcemap: !isProduction,
  logLevel: 'info',
  external: ['chrome'],
  plugins: [envAliasPlugin],
  define: {
    BUILD_ENV: JSON.stringify(BUILD_ENV)
  }
};

// Popup — ESM (loaded via <script type="module"> in popup.html)
const popupBuildOptions = {
  entryPoints: ['src/popup/popup.js'],
  bundle: true,
  outfile: 'dist/src/popup/popup.js',
  format: 'esm',
  platform: 'browser',
  target: ['chrome90'],
  minify: isProduction,
  sourcemap: !isProduction,
  logLevel: 'info',
  external: ['chrome'],
  plugins: [envAliasPlugin],
  define: {
    BUILD_ENV: JSON.stringify(BUILD_ENV)
  }
};

// ============================================
// BUILD
// ============================================

if (isWatch) {
  console.log('👀 Watching for changes...');

  const contentCtx = await esbuild.context(contentBuildOptions);
  const swCtx = await esbuild.context(serviceWorkerBuildOptions);
  const popupCtx = await esbuild.context(popupBuildOptions);

  await contentCtx.watch();
  await swCtx.watch();
  await popupCtx.watch();

  console.log('✅ Watching — source files are never mutated');
} else {
  // IMPORTANT: copyFiles() runs FIRST so that bundle outputs are not
  // overwritten by the raw copied sources.
  //
  // Order:
  //   1. Copy static files (html, css, api/, state/, utils/, icons, manifest)
  //   2. Bundle entry points on top — these overwrite their copied sources
  //      (only popup.js overlaps; content/ and background/ aren't copied)
  copyFiles();

  // 2. Content script
  await esbuild.build(contentBuildOptions);
  console.log('✅ Content scripts bundled!');

  // 3. Service worker
  await esbuild.build(serviceWorkerBuildOptions);
  console.log('✅ Service worker bundled!');

  // 4. Popup
  await esbuild.build(popupBuildOptions);
  console.log('✅ Popup bundled!');

  // 5. Post-build sanity check
  verifyNoDevUrlsInProd();
}

// ============================================
// COPY STATIC FILES
// ============================================

function copyFiles() {
  console.log('📦 Copying files...');

  // Create dist directories
  const dirs = [
    'icons',
    'src/api',
    'src/background',
    'src/popup',
    'src/state',
    'src/utils'
  ];
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

  // Copy src files.
  //
  // NOTE: `background` and `content` are excluded — they're bundled.
  // NOTE: `config` is excluded — its env values are inlined into the
  //       bundles by the env-alias plugin.
  // NOTE: `popup` IS copied here (for popup.html + popup.css). The
  //       popup.js file copied here is overwritten by the popup bundle
  //       step, which runs AFTER copyFiles().
  const srcDirs = ['api', 'popup', 'state', 'utils'];
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

// ============================================
// POST-BUILD SANITY CHECK
// ============================================

function verifyNoDevUrlsInProd() {
  if (!isProduction) {
    console.log('ℹ️  Skipping sanity check (non-production build)');
    return;
  }

  const bundles = [
    'dist/src/background/service-worker.js',
    'dist/src/content/bundle.js',
    'dist/src/popup/popup.js'
  ];

  const forbidden = [
    'localhost:8000',
    'localhost:3000',
    'staging-api.jobpulse.io',
    'staging.jobpulse.io'
  ];

  const violations = [];

  for (const file of bundles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const url of forbidden) {
      if (content.includes(url)) {
        violations.push(`${file} contains "${url}"`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('\n❌ PRODUCTION BUILD CONTAINS DEV/STAGING URLS:');
    for (const v of violations) {
      console.error(`   - ${v}`);
    }
    console.error('\n   This means the env alias failed.\n');
    process.exit(1);
  }

  console.log('✅ Production sanity check passed — no dev/staging URLs in bundle');
}