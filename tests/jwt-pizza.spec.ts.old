import { test, expect } from '@playwright/test';

test.describe('JWT Pizza Functional Tests', () => {

  test('should login as admin and navigate to dashboard', async ({ page }) => {
    await page.goto('/');

    // Click login button
    await page.getByRole('link', { name: 'Login' }).click();

    // Fill in admin credentials
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');

    // Submit login
    await page.getByRole('button', { name: 'Login' }).click();

    // Wait for navigation and check if logged in
    await expect(page).toHaveURL(/.*\//);

    // Verify admin is logged in by checking for Logout button
    await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();

    // Check that user name is displayed
    await expect(page.locator('text=Admin')).toBeVisible();
  });

  test('should order a pizza as admin', async ({ page }) => {
    await page.goto('/');

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to menu
    await page.goto('http://localhost:5173/menu');
    await page.waitForLoadState('networkidle');

    // Select a store from the dropdown
    await page.locator('select').selectOption({ index: 1 });

    // Wait for pizza images to load
    await page.waitForSelector('img[src*="pizza"]');

    // Select a pizza by clicking via the image
    await page.evaluate(() => {
      const pizzaImg = document.querySelector('img[src*="pizza1"]');
      const pizzaButton = pizzaImg?.closest('button');
      if (pizzaButton) (pizzaButton as HTMLButtonElement).click();
    });

    // Wait for the order state to update
    await page.waitForSelector('text=/Selected pizzas: \\d+/');

    // Click checkout button - use evaluate to bypass stability issues
    await page.evaluate(() => {
      const checkoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Checkout'));
      if (checkoutBtn && !(checkoutBtn as HTMLButtonElement).disabled) {
        (checkoutBtn as HTMLButtonElement).click();
      }
    });

    // Verify we're on the payment page
    await expect(page).toHaveURL(/.*payment.*/);

    // Click "Pay now" button to complete the order
    await page.getByRole('button', { name: 'Pay now' }).click();

    // Verify we're redirected to delivery page
    await expect(page).toHaveURL(/.*delivery.*/);
  });

  test('should validate pizza order flow and JWT', async ({ page }) => {
    await page.goto('/');

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to menu/order page
    await page.goto('http://localhost:5173/menu');
    await page.waitForLoadState('networkidle');

    // Select a store
    await page.locator('select').selectOption({ index: 1 });

    // Wait for pizza images to load
    await page.waitForSelector('img[src*="pizza"]');

    // Select a pizza - use evaluate to bypass animations
    await page.locator('.grid').locator('button').first().waitFor({ state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const pizzaButton = document.querySelector('.grid button');
      if (pizzaButton) (pizzaButton as HTMLButtonElement).click();
    });

    // Wait for the order state to update
    await page.waitForSelector('text=/Selected pizzas: \\d+/');

    // Go to checkout - submit the form properly
    await page.evaluate(() => {
      const checkoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Checkout')) as HTMLButtonElement;
      if (checkoutBtn && !checkoutBtn.disabled) {
        const form = checkoutBtn.closest('form');
        if (form) {
          form.requestSubmit();
        } else {
          checkoutBtn.click();
        }
      }
    });

    // Listen for the order API response that contains the JWT
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/order') && response.request().method() === 'POST'
    );

    // Click Pay now
    await page.getByRole('button', { name: 'Pay now' }).click();

    // Get the response and extract the JWT
    const response = await responsePromise;
    const responseBody = await response.json();

    // Verify JWT exists
    expect(responseBody).toHaveProperty('jwt');
    console.log('Pizza JWT found:', responseBody.jwt);

    // Validate JWT structure (should have 3 parts separated by dots)
    const jwtParts = responseBody.jwt.split('.');
    expect(jwtParts).toHaveLength(3);

    // Decode the payload to verify it contains pizza data
    const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
    console.log('JWT Payload:', payload);

    // Verify payload contains expected fields
    expect(payload).toHaveProperty('vendor');
  });

  test('should login as franchisee and view dashboard', async ({ page }) => {
    await page.goto('/');

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Verify franchisee is logged in
    await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();

    // Navigate to franchisee dashboard
    await page.locator('a[href*="franchise"]').first().click();

    // Verify we're on the franchise dashboard
    await expect(page).toHaveURL(/.*franchise.*/);

    // Verify the table with stores and revenue is displayed
    await expect(page.locator('table')).toBeVisible();

    // Check that the Revenue column header exists
    await expect(page.locator('thead th:has-text("Revenue")')).toBeVisible();

    // Check that there's at least one store row with revenue
    const revenueCell = page.locator('tbody tr td:nth-child(2)').first();
    await expect(revenueCell).toBeVisible();

    const revenueText = await revenueCell.textContent();
    console.log('Revenue display found:', revenueText);

    // Verify that revenue contains the Bitcoin symbol ₿
    expect(revenueText).toContain('₿');
  });

  test('complete user flow: admin orders pizza, franchisee sees revenue', async ({ page, context }) => {
    // Step 1: Admin orders a pizza
    await page.goto('/');
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to order page
    await page.goto('http://localhost:5173/menu');
    await page.waitForLoadState('networkidle');

    // Select store and pizza
    await page.locator('select').selectOption({ index: 1 });

    // Wait for pizza images to load
    await page.waitForSelector('img[src*="pizza"]');

    // Select a pizza - use evaluate to bypass animations
    await page.locator('.grid').locator('button').first().waitFor({ state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const pizzaButton = document.querySelector('.grid button');
      if (pizzaButton) (pizzaButton as HTMLButtonElement).click();
    });

    // Wait for the order state to update
    await page.waitForSelector('text=/Selected pizzas: \\d+/');

    // Go to checkout - submit the form properly
    await page.evaluate(() => {
      const checkoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Checkout')) as HTMLButtonElement;
      if (checkoutBtn && !checkoutBtn.disabled) {
        const form = checkoutBtn.closest('form');
        if (form) {
          form.requestSubmit();
        } else {
          checkoutBtn.click();
        }
      }
    });

    // Wait to be on payment page
    await expect(page).toHaveURL(/.*payment.*/);

    // Click Pay now
    await page.getByRole('button', { name: 'Pay now' }).click();

    // Wait for order to complete (should be on delivery page)
    await expect(page).toHaveURL(/.*delivery.*/);

    // Logout
    await page.getByRole('link', { name: 'Logout' }).click();

    // Step 2: Login as franchisee and check revenue
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to franchise dashboard
    await page.locator('a[href*="franchise"]').first().click();

    // Verify revenue is displayed in the table
    const revenueCell = page.locator('tbody tr td:nth-child(2)').first();
    await expect(revenueCell).toBeVisible();

    const revenueText = await revenueCell.textContent();
    console.log('Final revenue display:', revenueText);

    // Verify revenue contains the Bitcoin symbol and is greater than 0
    expect(revenueText).toContain('₿');
    // Extract the numeric value and verify it's not 0
    const revenueMatch = revenueText?.match(/[\d,]+/);
    if (revenueMatch) {
      const revenue = parseFloat(revenueMatch[0].replace(/,/g, ''));
      expect(revenue).toBeGreaterThan(0);
    }
  });
});
