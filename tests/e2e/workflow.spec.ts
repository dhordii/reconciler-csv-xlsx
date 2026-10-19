import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('reconciles two CSV files, resolves every exception, and exports a corrected copy', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/');
  const uploadAccessibility = await new AxeBuilder({ page }).analyze();
  expect(uploadAccessibility.violations).toEqual([]);
  const inputs = page.locator('input[type=file][accept*=".csv"]');
  await inputs.nth(0).setInputFiles(path.resolve('fixtures/reconciliation-a.csv'));
  await inputs.nth(1).setInputFiles(path.resolve('fixtures/reconciliation-b.csv'));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Confirm how each file is read' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await expect(page.getByText('6 mapped')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Set comparison rules' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Review before running' })).toBeVisible();
  await page.getByRole('button', { name: 'Run reconciliation' }).click();

  await expect(page.getByRole('heading', { name: 'Resolve differences' })).toBeVisible();
  await expect(page.getByRole('button', { name: /2\s+Differences/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /4\s+Duplicates/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /2\s+Missing key/ })).toBeVisible();
  const resultsAccessibility = await new AxeBuilder({ page }).analyze();
  expect(resultsAccessibility.violations).toEqual([]);

  const search = page.getByPlaceholder('Search by key or value');
  await search.focus();
  const searchOutline = await search.evaluate(
    (input) => getComputedStyle(input.closest('.search-control') as HTMLElement).outlineStyle,
  );
  expect(searchOutline).not.toBe('none');

  const firstDetails = page.locator('details.result-details').first();
  await firstDetails.getByText('View full paired record').click();
  await expect(firstDetails).toHaveAttribute('open', '');
  await expect(firstDetails.getByText('Customer')).toBeVisible();

  await page.getByRole('button', { name: 'Use File B values' }).click();
  await expect(page.getByText('2 of 7 resolved')).toBeVisible();

  await page.getByRole('button', { name: /1\s+Only A/ }).click();
  await page.getByRole('button', { name: 'Include row' }).click();
  await page.getByRole('button', { name: /1\s+Only B/ }).click();
  await page.getByRole('button', { name: 'Include row' }).click();

  await page.getByRole('button', { name: /4\s+Duplicates/ }).click();
  const duplicateDetails = page.locator('details.result-details').first();
  await duplicateDetails.getByText('View all duplicate rows').click();
  await expect(duplicateDetails.getByRole('heading', { name: 'File A · source row 5' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep File A rows' }).click();

  await page.getByRole('button', { name: /2\s+Missing key/ }).click();
  const excludeMissing = page.getByRole('button', { name: 'Exclude row' });
  await excludeMissing.nth(0).click();
  await excludeMissing.nth(1).click();
  await expect(page.getByText('7 of 7 resolved')).toBeVisible();

  await page.getByRole('button', { name: 'Preview output' }).click();
  await expect(page.getByRole('heading', { name: 'Output preview' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('New Market');
  await page.getByRole('button', { name: 'Close output preview' }).click();

  await page.getByRole('button', { name: 'Download reconciled CSV' }).click();
  const formulaDialog = page.getByRole('dialog', { name: 'Potential spreadsheet formulas found' });
  await expect(formulaDialog).toContainText('formula-like cell');
  const downloadPromise = page.waitForEvent('download');
  await formulaDialog.getByRole('button', { name: 'Download safe CSV' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const exportedCsv = await readFile(downloadPath ?? '', 'utf8');
  expect(exportedCsv).toContain('1002,Blue Harbor,126');
  expect(exportedCsv).toContain('1005,case study,77');
  expect(exportedCsv).toContain('1007,New Market,55');
  expect(exportedCsv).toContain("'=2+2");
  expect(exportedCsv).not.toMatch(/(^|,)=2\+2(?:,|$)/m);
  expect(exportedCsv).not.toContain('Missing Key Ltd');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Changed column')).toBeVisible();
  await expect(page.getByLabel('Sort')).toBeVisible();
  const resultsLayout = await page.evaluate(() => ({
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 60),
      }))
      .filter((element) => element.right > document.documentElement.clientWidth + 1),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(resultsLayout.overflow, JSON.stringify(resultsLayout.offenders)).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Edit rules' }).click();
  await expect(page.getByRole('heading', { name: 'Set comparison rules' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download reconciled CSV' })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('starts the complete workflow with bundled sample data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample data' }).click();

  await expect(page.getByRole('heading', { name: 'Confirm how each file is read' })).toBeVisible();
  await expect(page.getByText('reconciliation-a.csv')).toBeVisible();
  await expect(page.getByText('reconciliation-b.csv')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('6 mapped')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Run reconciliation' }).click();

  await expect(page.getByRole('heading', { name: 'Resolve differences' })).toBeVisible();
  await expect(page.getByRole('button', { name: /2\s+Differences/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /4\s+Duplicates/ })).toBeVisible();

  const stepper = page.getByRole('navigation', { name: 'Reconciliation progress' });
  await stepper.getByRole('button', { name: 'Match columns' }).click();
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download reconciled CSV' })).toHaveCount(0);
});

test('keeps selected files when sample replacement is cancelled', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept*=".csv"]')
    .first()
    .setInputFiles(path.resolve('fixtures/edge-cases-a.csv'));
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('button', { name: 'Try sample data' }).click();

  await expect(page.getByText('edge-cases-a.csv')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
});

test('keeps the upload workflow usable at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('reads XLSX worksheets and surfaces uncached formula warnings', async ({ page }) => {
  await page.goto('/');
  const inputs = page.locator('input[type=file][accept*=".csv"]');
  await inputs.nth(0).setInputFiles(path.resolve('fixtures/reconciliation-a.xlsx'));
  await inputs.nth(1).setInputFiles(path.resolve('fixtures/reconciliation-b.xlsx'));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Confirm how each file is read' })).toBeVisible();
  await expect(page.getByText(/1 formula cell had no cached result/)).toBeVisible();
  await expect(page.getByLabel('File B data preview')).toContainText('Cached formula');
});

test('offers a keyboard skip link to the workflow', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to reconciliation workflow' });
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page).toHaveURL(/#main-workflow$/u);
});

test('keeps the dark theme free of automated accessibility violations', async ({ page }) => {
  await page.goto('/');
  const themeButton = page.getByRole('button', { name: /Theme:/ });
  await themeButton.click();
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
