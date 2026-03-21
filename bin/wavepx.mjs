#!/usr/bin/env node

/**
 * wavepx CLI — open the wavepx web app.
 *
 * Usage:
 *   npx wavepx          # open the web app
 *   npx wavepx --help   # show help
 */

import { execSync } from 'child_process';
import { platform } from 'os';

const SITE_URL = 'https://wavepx.vercel.app';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log();
  console.log('  \x1b[32m\x1b[1mWAVEPX\x1b[0m  data over sound');
  console.log();
  console.log('  Usage:');
  console.log('    npx wavepx          Open the web app');
  console.log('    npx wavepx --help   Show this help');
  console.log();
  console.log(`  Web app:  \x1b[36m${SITE_URL}\x1b[0m`);
  console.log('  GitHub:   \x1b[36mhttps://github.com/0xNtive/wavepx\x1b[0m');
  console.log('  npm:      \x1b[36mhttps://www.npmjs.com/package/wavepx\x1b[0m');
  console.log();
  console.log('  Built on ggwave by Georgi Gerganov');
  console.log('  \x1b[36mhttps://github.com/ggerganov/ggwave\x1b[0m');
  console.log();
  process.exit(0);
}

console.log();
console.log('  \x1b[32m\x1b[1mWAVEPX\x1b[0m  data over sound');
console.log();
console.log(`  Opening:  \x1b[36m${SITE_URL}\x1b[0m`);
console.log();

// Open the URL in the default browser
const p = platform();
try {
  if (p === 'darwin') {
    execSync(`open "${SITE_URL}"`);
  } else if (p === 'win32') {
    execSync(`start "" "${SITE_URL}"`);
  } else {
    execSync(`xdg-open "${SITE_URL}"`);
  }
} catch {
  console.log(`  Could not open browser. Visit the URL above manually.`);
  console.log();
}
