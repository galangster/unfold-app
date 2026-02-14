#!/usr/bin/env tsx
/**
 * Unfold App - Complete Visual Audit
 * Simplified version for mobile directory
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface ScreenAudit {
  name: string;
  path: string;
  interaction: 'scroll' | 'click' | 'animation' | 'full-flow';
}

const SCREENS: ScreenAudit[] = [
  { name: 'Welcome', path: '/welcome', interaction: 'full-flow' },
  { name: 'Onboarding', path: '/style-onboarding', interaction: 'full-flow' },
  { name: 'Home', path: '/(main)/home', interaction: 'scroll' },
  { name: 'Reading', path: '/(main)/reading', interaction: 'scroll' },
  { name: 'Settings', path: '/(main)/settings', interaction: 'click' },
  { name: 'Showcase', path: '/showcase', interaction: 'animation' }
];

async function recordScreen(browser: any, screen: ScreenAudit, viewport: any) {
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: './videos/', size: viewport }
  });
  
  const page = await context.newPage();
  const url = `http://localhost:8081${screen.path}`;
  
  console.log(`  📱 Recording ${screen.name} at ${viewport.width}x${viewport.height}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Perform interaction
    switch (screen.interaction) {
      case 'scroll':
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        break;
      case 'click':
        const buttons = await page.locator('button').all();
        for (const btn of buttons.slice(0, 3)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(300);
        }
        break;
      case 'animation':
        const elements = await page.locator('button, [data-animate]').all();
        for (const el of elements.slice(0, 5)) {
          await el.hover().catch(() => {});
          await page.waitForTimeout(200);
        }
        break;
    }
    
    await page.waitForTimeout(2000);
    
  } catch (e) {
    console.log(`  ⚠️  Error: ${e.message}`);
  }
  
  await context.close();
}

async function audit() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Unfold App - Visual Audit                            ║
╚══════════════════════════════════════════════════════════╝
`);
  
  // Check server
  try {
    const resp = await fetch('http://localhost:8081/showcase');
    if (!resp.ok) throw new Error('Server not responding');
  } catch {
    console.log('❌ Expo server not running. Start with: npx expo start --web');
    return;
  }
  
  console.log('✅ Expo server detected\n');
  
  const browser = await chromium.launch();
  const results = [];
  
  for (const screen of SCREENS) {
    console.log(`\n📱 ${screen.name}`);
    console.log('-'.repeat(50));
    
    // Mobile
    await recordScreen(browser, screen, { width: 375, height: 667 });
    
    // Desktop
    await recordScreen(browser, screen, { width: 1280, height: 720 });
    
    results.push({ screen: screen.name, status: 'recorded' });
    console.log('  ✅ Recorded\n');
  }
  
  await browser.close();
  
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 AUDIT COMPLETE');
  console.log(`${'='.repeat(50)}\n`);
  console.log(`Screens recorded: ${results.length}`);
  console.log(`Videos saved: ./videos/`);
  console.log('\n🎬 Review videos manually or run AI analysis:');
  console.log('   npx tsx scripts/analyze-videos.ts');
}

audit().catch(console.error);
