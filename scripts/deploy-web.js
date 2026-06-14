#!/usr/bin/env node
// ── Web build + Sentry source map upload + Firebase Hosting deploy ───────────
// One command for shipping the web/PWA build. Replaces the manual
//   npx expo export -p web   &&   firebase deploy --only hosting
// pair so source maps get uploaded to Sentry every deploy (readable stack
// traces instead of minified `entry-<hash>.js:902:1185` frames).
//
// Flow:
//   1. expo export -p web -s        → builds dist/ WITH .map files
//   2. sentry-cli sourcemaps inject → stamps matching debug IDs into the
//                                     emitted .js + .map (so Sentry can
//                                     symbolicate without a release name)
//   3. sentry-cli sourcemaps upload → sends the maps to Sentry
//   4. firebase deploy --only hosting → ships dist/. The .map files are
//                                     git/Firebase-ignored (firebase.json
//                                     "ignore": "**/*.map"), so source is
//                                     uploaded to Sentry but NEVER served
//                                     publicly.
//
// The Sentry steps are SKIPPED (with a warning, non-fatal) when credentials
// aren't configured, so `npm run deploy:web` still works without Sentry set up.
// Credentials live in `.sentryclirc` (gitignored) or the SENTRY_AUTH_TOKEN /
// SENTRY_ORG / SENTRY_PROJECT env vars — see .env.example.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function run(cmd) {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

// sentry-cli reads org/project/token from .sentryclirc in cwd or from env.
function sentryConfigured() {
  if (fs.existsSync(path.join(root, '.sentryclirc'))) return true;
  return Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);
}

// 1. Build with source maps.
run('npx expo export -p web -s');

// 2 + 3. Inject debug IDs and upload maps — only if Sentry is set up.
if (sentryConfigured()) {
  try {
    run('npx sentry-cli sourcemaps inject dist');
    run('npx sentry-cli sourcemaps upload dist');
  } catch (e) {
    console.warn('\n[deploy-web] Sentry source map upload failed; continuing to deploy.\n', e.message);
  }
} else {
  console.warn(
    '\n[deploy-web] Sentry not configured (.sentryclirc / SENTRY_* env missing). ' +
      'Skipping source map upload — stack traces will stay minified.\n'
  );
}

// 4. Deploy. .map files are excluded by firebase.json "ignore".
run('firebase deploy --only hosting');

console.log('\n[deploy-web] Done.\n');
