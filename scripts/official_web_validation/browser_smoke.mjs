#!/usr/bin/env node
/**
 * Optional browser smoke for the official-first static web build.
 *
 * Usage:
 *   npm run svelte:build
 *   npm run official-web:browser-smoke
 *
 * This script is optional because Playwright is not a project dependency. If it
 * is available in the environment, the smoke starts a local static server and
 * confirms the home, builder, coder, and runner routes render without console
 * page errors. It never modifies app logic or browser storage outside the temp
 * browser context created by Playwright.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const ROUTES = ['/', '/builder/', '/coder/', '/runner/'];
const PORT = process.env.OFFICIAL_WEB_SMOKE_PORT || '4177';
const BASE_URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    console.error('Playwright is not installed. Install it in CI/dev with: npm install --no-save playwright');
    console.error('Then run: npm run official-web:browser-smoke');
    if (process.env.OFFICIAL_WEB_SMOKE_REQUIRE_PLAYWRIGHT === '1') {
      process.exitCode = 2;
    } else {
      console.error('Skipping optional browser smoke. Set OFFICIAL_WEB_SMOKE_REQUIRE_PLAYWRIGHT=1 to make this a hard failure.');
      process.exitCode = 0;
    }
    return null;
  }
}

async function waitForServer(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`Static server did not become ready at ${url}`);
}

async function main() {
  const pw = await importPlaywright();
  if (!pw) return;

  const server = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', PORT, '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const serverOutput = [];
  server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()));
  server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()));

  try {
    await waitForServer(`${BASE_URL}/`);
    const browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const failures = [];

    for (const route of ROUTES) {
      const page = await context.newPage();
      page.on('pageerror', (err) => failures.push(`${route} pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') failures.push(`${route} console error: ${msg.text()}`);
      });
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      if (!response?.ok()) failures.push(`${route} HTTP ${response?.status()}`);
      await page.locator('body').waitFor({ state: 'visible', timeout: 5000 });
      await page.close();
    }

    await context.close();
    await browser.close();

    if (failures.length) {
      throw new Error(`Browser smoke failed:\n${failures.join('\n')}`);
    }
    console.log(`Browser smoke passed for ${ROUTES.length} routes at ${BASE_URL}`);
  } catch (err) {
    console.error(err.message || err);
    if (serverOutput.length) {
      console.error('\nStatic server output:');
      console.error(serverOutput.join('').slice(-4000));
    }
    process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
  }
}

main();
