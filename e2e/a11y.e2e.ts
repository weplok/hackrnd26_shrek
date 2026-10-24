import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Key screens outside puzzles (NFR-08).
const screens = ['/', '/nickname', '/campaign', '/codex', '/settings', '/about'];

for (const path of screens) {
  test(`no serious or critical axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
    expect(blocking).toEqual([]);
  });
}
