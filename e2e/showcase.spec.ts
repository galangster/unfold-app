import { test, expect } from '@playwright/test';

test.describe('Unfold Component Showcase', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/showcase');
  });

  test('showcase loads with all components', async ({ page }) => {
    await expect(page.getByText('Unfold Component Showcase')).toBeVisible();
    await expect(page.getByText('Streak Counter')).toBeVisible();
    await expect(page.getByText('Sparkle Burst')).toBeVisible();
    await expect(page.getByText('Audio Waveform')).toBeVisible();
    await expect(page.getByText('Theme Colors')).toBeVisible();
  });

  test('streak counter displays correctly', async ({ page }) => {
    const streakSection = page.locator('text=Streak Counter').locator('..');
    await expect(streakSection).toContainText('day');
    await expect(streakSection.locator('[role="img"]')).toBeVisible();
  });

  test('sparkle burst animation triggers', async ({ page }) => {
    const triggerBtn = page.getByText('Trigger Sparkle');
    await triggerBtn.click();
    // Wait for animation
    await page.waitForTimeout(500);
    // Take screenshot for visual regression
    await expect(page.locator('body')).toHaveScreenshot('sparkle-burst.png');
  });

  test('audio waveform plays', async ({ page }) => {
    const playBtn = page.getByText('Play Waveform');
    await playBtn.click();
    await expect(page.getByText('Stop Waveform')).toBeVisible();
    // Wait for animation
    await page.waitForTimeout(1000);
    await page.getByText('Stop Waveform').click();
    await expect(page.getByText('Play Waveform')).toBeVisible();
  });

  test('visual regression - full page', async ({ page }) => {
    await expect(page).toHaveScreenshot('showcase-full.png', {
      fullPage: true,
    });
  });
});
