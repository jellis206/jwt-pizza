import { test, expect } from '@playwright/test';

test('debug menu page', async ({ page }) => {
  // Listen to console messages
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  // Listen to page errors
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  // Listen to network responses
  page.on('response', response => {
    console.log(`Response: ${response.status()} ${response.url()}`);
  });

  await page.goto('/');

  // Login as admin
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill('a@jwt.com');
  await page.getByPlaceholder('Password').fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  // Navigate to menu - use page.goto instead of clicking
  console.log('Navigating to menu...');
  await page.goto('http://localhost:5173/menu');
  await page.waitForLoadState('networkidle');

  // Select a store
  await page.locator('select').selectOption({ index: 1 });

  // Wait for pizza images
  await page.waitForSelector('img[src*="pizza"]');

  // Check the URL
  const currentURL = page.url();
  console.log('Current URL:', currentURL);

  // Check the page title
  const title = await page.title();
  console.log('Page title:', title);

  // Take screenshot before trying to click
  await page.screenshot({ path: 'test-results/menu-with-pizzas.png', fullPage: true });

  // Debug: check what's in the page
  await page.evaluate(() => {
    console.log('Page location:', window.location.href);
    const grids = document.querySelectorAll('[class*="grid"]');
    console.log('Elements with grid class:', grids.length);
    grids.forEach((g, i) => console.log(`Grid ${i} classes:`, g.className));

    const allButtons = document.querySelectorAll('button');
    console.log('Total buttons on page:', allButtons.length);

    // Look for buttons inside divs that might contain pizzas
    const pizzaImages = Array.from(document.querySelectorAll('img[src*="pizza"]'));
    console.log('Pizza images found:', pizzaImages.length);
    pizzaImages.forEach((img, i) => {
      const button = img.closest('button');
      console.log(`Pizza ${i} button:`, button?.tagName, button?.type);
    });
  });

  // Try clicking the first pizza card directly
  await page.evaluate(() => {
    const pizzaImg = document.querySelector('img[src*="pizza1"]');
    const pizzaButton = pizzaImg?.closest('button');
    console.log('Found pizza button via image:', !!pizzaButton);
    if (pizzaButton) {
      (pizzaButton as HTMLButtonElement).click();
      console.log('Pizza button clicked via image search');
    }
  });

  // Wait a bit for React to update
  await page.waitForTimeout(1000);

  // Take screenshot after click
  await page.screenshot({ path: 'test-results/after-pizza-click.png', fullPage: true });

  // Check if the selected pizzas message appeared
  const selectedText = await page.locator('text=/Selected pizzas|What are you waiting for/').first().textContent();
  console.log('Selected message:', selectedText);

  // Check checkout button state
  const checkoutDisabled = await page.locator('button:has-text("Checkout")').getAttribute('disabled');
  console.log('Checkout button disabled:', checkoutDisabled);

  // End test here for now
  return;

  // Submit form to checkout
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

  // Wait for navigation
  await page.waitForURL(/.*payment.*/);

  // Take a screenshot of payment page
  await page.screenshot({ path: 'test-results/payment-page.png', fullPage: true });

  // Print the HTML of payment page
  const html = await page.content();
  console.log('Payment Page HTML:', html.substring(0, 2000));

  // Check what buttons exist on payment page
  const buttons = await page.locator('button').all();
  console.log('Number of buttons on payment page:', buttons.length);

  for (let i = 0; i < Math.min(buttons.length, 10); i++) {
    const text = await buttons[i].textContent();
    const type = await buttons[i].getAttribute('type');
    const isVisible = await buttons[i].isVisible();
    const title = await buttons[i].getAttribute('title');
    console.log(`Payment Button ${i}: type="${type}", visible=${isVisible}, title="${title}", text="${text?.substring(0, 100)}"`);
  }

  // Check for "Pay now" specifically
  const payNowButtons = await page.locator('button:has-text("Pay")').all();
  console.log('Buttons containing "Pay":', payNowButtons.length);
});
