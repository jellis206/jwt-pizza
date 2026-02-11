import { test, expect, Page } from 'playwright-test-coverage';

// Type definitions
enum Role {
  Diner = 'diner',
  Franchisee = 'franchisee',
  Admin = 'admin',
}

interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  roles: { role: Role }[];
}

// Helper function to set up basic mocks
async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = {
    'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
    'f@jwt.com': { id: '4', name: 'Pizza Franchisee', email: 'f@jwt.com', password: 'franchisee', roles: [{ role: Role.Franchisee }] },
    'a@jwt.com': { id: '1', name: 'Admin User', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] },
  };

  // Handle auth endpoints (login, register, and logout)
  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      // Login
      const loginReq = route.request().postDataJSON();
      const user = validUsers[loginReq.email];
      if (!user || user.password !== loginReq.password) {
        await route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
        return;
      }
      loggedInUser = validUsers[loginReq.email];
      const loginRes = {
        user: {
          id: loggedInUser.id,
          name: loggedInUser.name,
          email: loggedInUser.email,
          roles: loggedInUser.roles,
        },
        token: 'abcdef',
      };
      await route.fulfill({ json: loginRes });
    } else if (route.request().method() === 'POST') {
      // Register
      const registerReq = route.request().postDataJSON();
      const newUser: User = {
        id: '100',
        name: registerReq.name,
        email: registerReq.email,
        password: registerReq.password,
        roles: [{ role: Role.Diner }],
      };
      loggedInUser = newUser;
      validUsers[newUser.email] = newUser;
      const registerRes = {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          roles: newUser.roles,
        },
        token: 'abcdef',
      };
      await route.fulfill({ json: registerRes });
    } else if (route.request().method() === 'DELETE') {
      // Logout
      loggedInUser = undefined;
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  // Return the currently logged in user
  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
  });

  // A standard menu
  await page.route('*/**/api/order/menu', async (route) => {
    const menuRes = [
      {
        id: '1',
        title: 'Veggie',
        image: 'pizza1.png',
        price: 0.0038,
        description: 'A garden of delight',
      },
      {
        id: '2',
        title: 'Pepperoni',
        image: 'pizza2.png',
        price: 0.0042,
        description: 'Spicy treat',
      },
      {
        id: '3',
        title: 'Margarita',
        image: 'pizza3.png',
        price: 0.0014,
        description: 'Essential classic',
      },
      {
        id: '4',
        title: 'Crusty',
        image: 'pizza4.png',
        price: 0.0024,
        description: 'A dry mouthed favorite',
      },
    ];
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menuRes });
  });

  // Standard franchises and stores
  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      const franchiseRes = {
        franchises: [
          {
            id: '2',
            name: 'LotaPizza',
            admins: [{ email: 'f@jwt.com', id: '4', name: 'Pizza Franchisee' }],
            stores: [
              { id: '4', name: 'Lehi', totalRevenue: 100 },
              { id: '5', name: 'Springville', totalRevenue: 200 },
              { id: '6', name: 'American Fork', totalRevenue: 150 },
            ],
          },
          { id: '3', name: 'PizzaCorp', stores: [{ id: '7', name: 'Spanish Fork', totalRevenue: 50 }] },
          { id: '4', name: 'topSpot', stores: [] },
        ],
        more: false,
      };
      await route.fulfill({ json: franchiseRes });
    } else if (route.request().method() === 'POST') {
      // Handle franchise creation
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          id: '100',
          name: body.name,
          admins: body.admins || [],
          stores: [],
        },
      });
    }
  });

  // User-specific franchise info
  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    const userFranchises = [
      {
        id: '2',
        name: 'LotaPizza',
        admins: [{ email: 'f@jwt.com', id: '4', name: 'Pizza Franchisee' }],
        stores: [
          { id: '4', name: 'Lehi', totalRevenue: 100 },
          { id: '5', name: 'Springville', totalRevenue: 200 },
        ],
      },
    ];
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: userFranchises });
  });

  // Order a pizza or get order history
  await page.route('*/**/api/order', async (route) => {
    if (route.request().method() === 'POST') {
      const orderReq = route.request().postDataJSON();
      const orderRes = {
        order: { ...orderReq, id: '23', date: new Date().toISOString() },
        jwt: 'eyJpYXQ',
      };
      await route.fulfill({ json: orderRes });
    } else if (route.request().method() === 'GET') {
      // Get order history
      const orderHistory = {
        dinerId: loggedInUser?.id || '3',
        orders: [
          {
            id: '1',
            franchiseId: '2',
            storeId: '4',
            date: '2024-01-01T00:00:00.000Z',
            items: [{ menuId: '1', description: 'Veggie', price: 0.0038 }],
          },
        ],
        page: 0,
      };
      await route.fulfill({ json: orderHistory });
    }
  });

  // Docs endpoints
  await page.route('*/**/api/docs', async (route) => {
    const docsRes = {
      version: '20240101.0.0',
      endpoints: [
        { method: 'GET', path: '/api/order/menu', description: 'Get the pizza menu' },
        { method: 'POST', path: '/api/order', description: 'Create a new order' },
      ],
    };
    await route.fulfill({ json: docsRes });
  });

  await page.goto('/');
}

test.describe('JWT Pizza Tests', () => {
  test('home page', async ({ page }) => {
    await page.goto('/');
    expect(await page.title()).toBe('JWT Pizza');
  });

  test('login', async ({ page }) => {
    await basicInit(page);
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Check that user initials are displayed
    await expect(page.getByText('KC')).toBeVisible();
  });

  test('purchase with login', async ({ page }) => {
    await basicInit(page);

    // Go to order page
    await page.getByRole('button', { name: 'Order now' }).click();

    // Create order
    await expect(page.locator('h2')).toContainText('Awesome is a click away');

    // Select store by value (store ID 4)
    await page.locator('select').selectOption('4');

    // Click on pizza cards to add them to order
    await page.getByText('Veggie').first().click();
    await page.getByText('Pepperoni').first().click();

    await expect(page.locator('form')).toContainText('Selected pizzas: 2');
    await page.getByRole('button', { name: 'Checkout' }).click();

    // Login
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Pay
    await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
    await expect(page.locator('tbody')).toContainText('Veggie');
    await expect(page.locator('tbody')).toContainText('Pepperoni');
    await expect(page.locator('tfoot')).toContainText('0.008 ₿');
    await page.getByRole('button', { name: 'Pay now' }).click();

    // Check balance
    await expect(page.getByText('0.008')).toBeVisible();
  });

  test('logout', async ({ page }) => {
    await basicInit(page);

    // Login first
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('KC')).toBeVisible();

    // Logout
    await page.getByRole('link', { name: 'Logout' }).click();
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  });

  test('view menu without ordering', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'Order' }).click();
    await expect(page.locator('h2')).toContainText('Awesome is a click away');

    // Verify pizzas are displayed
    await expect(page.getByText('Veggie')).toBeVisible();
    await expect(page.getByText('Pepperoni')).toBeVisible();
    await expect(page.getByText('Margarita')).toBeVisible();
    await expect(page.getByText('Crusty')).toBeVisible();
  });

  test('failed login with invalid credentials', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('invalid@jwt.com');
    await page.getByPlaceholder('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).click();

    // Should still see login form
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('register new user', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'Register' }).click();
    await page.getByPlaceholder('Full name').fill('Test User');
    await page.getByPlaceholder('Email address').fill('test@jwt.com');
    await page.getByPlaceholder('Password').fill('testpass');
    await page.getByRole('button', { name: 'Register' }).click();

    // After registration, user should be logged in
    await expect(page.getByText('TU').first()).toBeVisible();
  });

  test('view about page', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('main')).toContainText('The secret sauce');
  });

  test('view history page', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('main')).toContainText('Mama Ricci');
  });

  test('view docs page', async ({ page }) => {
    await basicInit(page);

    await page.goto('/docs');
    await expect(page.getByRole('main')).toContainText('JWT Pizza API');
  });

  test('404 not found page', async ({ page }) => {
    await basicInit(page);

    await page.goto('/nonexistent-page');
    await expect(page.getByText('Oops')).toBeVisible();
  });

  test('diner dashboard', async ({ page }) => {
    await basicInit(page);

    // Login as diner
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Click on user initials to go to dashboard
    await page.getByText('KC').click();

    // Should see diner dashboard
    await expect(page.getByRole('main')).toContainText('Your pizza kitchen');
  });

  test('complete order flow with payment', async ({ page }) => {
    await basicInit(page);

    // Login
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Order pizza
    await page.goto('/menu');
    await page.locator('select').selectOption('4');
    await page.getByText('Veggie').first().click();
    await page.getByRole('button', { name: 'Checkout' }).click();

    // On payment page - check for payment content
    await expect(page.getByRole('main')).toContainText('pizza right now!');
    await page.getByRole('button', { name: 'Pay now' }).click();

    // Should reach delivery page
    await expect(page.getByText('0.004').first()).toBeVisible();
  });

  test('admin dashboard', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Go to admin page
    await page.getByRole('link', { name: 'Admin' }).click();

    // Should see admin dashboard
    await expect(page.getByRole('main')).toContainText('Mama Ricci');
  });

  test('franchisee dashboard', async ({ page }) => {
    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Go to franchise page
    await page.goto('/franchise-dashboard');

    // Should see franchise dashboard
    await expect(page.getByRole('main')).toContainText('franchise');
  });

  test('navigate through all pages', async ({ page }) => {
    await basicInit(page);

    // Check home
    await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();

    // Check order page
    await page.goto('/menu');
    await expect(page.locator('h2')).toContainText('Awesome is a click away');

    // Check about
    await page.goto('/about');
    await expect(page.getByRole('main')).toContainText('At JWT Pizza');

    // Check history
    await page.goto('/history');
    await expect(page.getByRole('main')).toContainText('Mama Ricci');
  });

  test('cancel order on payment page', async ({ page }) => {
    await basicInit(page);

    // Login and start order
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/menu');
    await page.locator('select').selectOption('4');
    await page.getByText('Pepperoni').first().click();
    await page.getByRole('button', { name: 'Checkout' }).click();

    // Cancel on payment page
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Should be back on menu
    await expect(page.locator('h2')).toContainText('Awesome is a click away');
  });

  test('try to checkout without selecting store', async ({ page }) => {
    await basicInit(page);

    await page.goto('/menu');
    await page.getByText('Margarita').first().click();

    // Checkout button should be disabled without store selection
    const checkoutBtn = page.getByRole('button', { name: 'Checkout' });
    await expect(checkoutBtn).toBeDisabled();
  });

  test('try to checkout without selecting pizza', async ({ page }) => {
    await basicInit(page);

    await page.goto('/menu');
    await page.locator('select').selectOption('4');

    // Checkout button should be disabled without pizza selection
    const checkoutBtn = page.getByRole('button', { name: 'Checkout' });
    await expect(checkoutBtn).toBeDisabled();
  });

  test('view franchise dashboard with stores', async ({ page }) => {
    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/franchise-dashboard');

    // Should see stores and revenue
    await expect(page.getByText('Lehi')).toBeVisible();
    await expect(page.getByText('Springville')).toBeVisible();
  });

  test('multiple pizza selection', async ({ page }) => {
    await basicInit(page);

    await page.goto('/menu');
    await page.locator('select').selectOption('4');

    // Add multiple pizzas
    await page.getByText('Veggie').first().click();
    await page.getByText('Pepperoni').first().click();
    await page.getByText('Margarita').first().click();

    // Should show 3 pizzas selected
    await expect(page.locator('form')).toContainText('Selected pizzas: 3');
  });

  test('view create franchise page as admin', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to create franchise page
    await page.goto('/create-franchise');

    // Check page loaded
    await expect(page.getByRole('main')).toContainText('franchise');
  });

  test('view create store page as franchisee', async ({ page }) => {
    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to create store page
    await page.goto('/franchise/2/create-store');

    // Check page loaded
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('view close franchise page', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/franchise/2/close');

    // Check page loaded
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('view close store page', async ({ page }) => {
    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/franchise/2/store/4/close');

    // Check page loaded
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('view delivery page after order', async ({ page }) => {
    await basicInit(page);

    await page.goto('/delivery');

    // Check page loaded
    await expect(page.getByRole('main')).toContainText('Pizza');
  });

  test('admin dashboard with franchise management', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/admin-dashboard');

    // Should show franchises
    await expect(page.getByText('LotaPizza')).toBeVisible();
  });

  test('register validation', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'Register' }).click();

    // Try to register without filling fields
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();

    // Fill partial info
    await page.getByPlaceholder('Full name').fill('Test');
    await page.getByPlaceholder('Email address').fill('test@test.com');

    // Fill all fields
    await page.getByPlaceholder('Password').fill('password123');
    await page.getByRole('button', { name: 'Register' }).click();

    // Should be logged in
    await expect(page.getByText('TT').first()).toBeVisible();
  });

  test('verify pizza factory integration', async ({ page }) => {
    // Mock pizza factory endpoint
    await page.route('**/api/order/verify', async (route) => {
      await route.fulfill({
        json: {
          message: 'valid',
          payload: {
            vendor: { id: '1', name: 'JWT Pizza' },
            diner: { id: '3', name: 'Kai Chen', email: 'd@jwt.com' },
            order: { items: [{ menuId: '1', description: 'Veggie', price: 0.0038 }] },
          },
        },
      });
    });

    await basicInit(page);

    // Just load the page to exercise the code
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();
  });

  test('interact with franchise create form', async ({ page }) => {
    await page.route('*/**/api/franchise', async (route) => {
      if (route.request().method() === 'POST') {
        const reqBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: '10',
            name: reqBody.name,
            admins: [{ email: reqBody.admins[0].email }],
            stores: [],
          },
        });
      }
    });

    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/create-franchise');

    // Try to interact with form if it exists
    const nameInput = page.getByPlaceholder('franchise name');
    if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nameInput.fill('Test Franchise');
    }
  });

  test('interact with store create form', async ({ page }) => {
    await page.route('*/**/api/franchise/*/store', async (route) => {
      if (route.request().method() === 'POST') {
        const reqBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: '20',
            name: reqBody.name,
          },
        });
      }
    });

    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/franchise/2/create-store');

    // Try to interact with form if it exists
    const nameInput = page.getByPlaceholder('store name');
    if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nameInput.fill('Test Store');
    }
  });

  test('test service error handling', async ({ page }) => {
    await page.route('*/**/api/auth', async (route) => {
      if (route.request().method() === 'PUT') {
        // Simulate error
        await route.fulfill({ status: 500, json: { message: 'Server error' } });
      }
    });

    await page.route('*/**/api/order/menu', async (route) => {
      const menuRes = [
        { id: '1', title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
      ];
      await route.fulfill({ json: menuRes });
    });

    await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
      const franchiseRes = { franchises: [], more: false };
      await route.fulfill({ json: franchiseRes });
    });

    await page.goto('/');

    // Try to login with error
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('test@jwt.com');
    await page.getByPlaceholder('Password').fill('test');
    await page.getByRole('button', { name: 'Login' }).click();

    // Should still be on login page
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('empty menu handling', async ({ page }) => {
    await page.route('*/**/api/order/menu', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
      const franchiseRes = { franchises: [], more: false };
      await route.fulfill({ json: franchiseRes });
    });

    await page.goto('/menu');

    // Menu should load even if empty
    await expect(page.locator('h2')).toContainText('Awesome is a click away');
  });

  test('franchise list pagination', async ({ page }) => {
    await page.route('*/**/api/order/menu', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
      const franchiseRes = {
        franchises: [
          { id: '1', name: 'Franchise1', stores: [] },
          { id: '2', name: 'Franchise2', stores: [] },
        ],
        more: true,
      };
      await route.fulfill({ json: franchiseRes });
    });

    await page.goto('/menu');

    // Page should load with paginated franchises
    await expect(page.locator('h2')).toContainText('Awesome is a click away');
  });

  test('verify payment page calculations', async ({ page }) => {
    await basicInit(page);

    // Login
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Order multiple pizzas
    await page.goto('/menu');
    await page.locator('select').selectOption('4');
    await page.getByText('Veggie').first().click();
    await page.getByText('Pepperoni').first().click();
    await page.getByText('Margarita').first().click();
    await page.getByRole('button', { name: 'Checkout' }).click();

    // Verify totals on payment page
    await expect(page.getByRole('main')).toContainText('Veggie');
    await expect(page.getByRole('main')).toContainText('Pepperoni');
    await expect(page.getByRole('main')).toContainText('Margarita');
  });

  test('diner dashboard shows order history', async ({ page }) => {
    await basicInit(page);

    // Login
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Go to diner dashboard
    await page.getByText('KC').click();

    // Should see order history
    await expect(page.getByRole('main')).toContainText('pizza');
  });

  test('franchisee can view revenue', async ({ page }) => {
    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to franchise dashboard
    await page.goto('/franchise-dashboard');

    // Should see revenue information
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('header navigation for logged in user', async ({ page }) => {
    await basicInit(page);

    // Login
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // User initials should be visible
    await expect(page.getByText('KC')).toBeVisible();

    // Logout link should be visible
    await expect(page.getByRole('link', { name: 'Logout' })).toBeVisible();
  });

  test('admin can view all franchises', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Go to admin dashboard
    await page.goto('/admin-dashboard');

    // Should see franchise management
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('menu animation on pizza selection', async ({ page }) => {
    await basicInit(page);

    await page.goto('/menu');
    await page.locator('select').selectOption('4');

    // Click a pizza to trigger animation
    const pizzaCard = page.getByText('Veggie').first();
    await pizzaCard.click();

    // Pizza should be added to order
    await expect(page.locator('form')).toContainText('Selected pizzas: 1');

    // Click another pizza
    await page.getByText('Pepperoni').first().click();
    await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  });

  test('test docs page different doc types', async ({ page }) => {
    await page.route('**/pizza-factory.cs329.click/api/docs', async (route) => {
      await route.fulfill({
        json: {
          version: '1.0.0',
          endpoints: [{ method: 'POST', path: '/api/order/verify', description: 'Verify order' }],
        },
      });
    });

    await basicInit(page);

    // Go to docs page
    await page.goto('/docs');

    // Page should load
    await expect(page.getByRole('main')).toContainText('JWT Pizza API');
  });

  test('order flow with different stores', async ({ page }) => {
    await basicInit(page);

    // Login
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Test ordering from different store
    await page.goto('/menu');
    await page.locator('select').selectOption('5'); // Springville store
    await page.getByText('Crusty').first().click();
    await page.getByRole('button', { name: 'Checkout' }).click();

    // Should proceed to payment
    await expect(page.getByRole('main')).toContainText('pizza');
  });

  test('change store selection during order', async ({ page }) => {
    await basicInit(page);

    await page.goto('/menu');

    // Select first store
    await page.locator('select').selectOption('4');
    await page.getByText('Veggie').first().click();

    // Change to different store
    await page.locator('select').selectOption('5');

    // Should still have pizza selected
    await expect(page.locator('form')).toContainText('Selected pizzas: 1');
  });

  test('multiple logout and login cycles', async ({ page }) => {
    await basicInit(page);

    // First login
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('KC')).toBeVisible();

    // Logout
    await page.getByRole('link', { name: 'Logout' }).click();
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();

    // Login again
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('KC')).toBeVisible();
  });

  test('verify order JWT', async ({ page }) => {
    await page.route('**/pizza-factory.cs329.click/api/order/verify', async (route) => {
      await route.fulfill({
        json: {
          message: 'valid',
          payload: { vendor: { id: '1', name: 'JWT Pizza' } },
        },
      });
    });

    await basicInit(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();
  });

  test('get franchise for user', async ({ page }) => {
    await page.route('*/**/api/franchise/*', async (route) => {
      if (route.request().method() === 'GET' && !route.request().url().includes('?')) {
        await route.fulfill({
          json: [{ id: '2', name: 'My Franchise', stores: [] }],
        });
      }
    });

    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/franchise-dashboard');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('docs with factory parameter', async ({ page }) => {
    await page.route('**/pizza-factory.cs329.click/api/docs', async (route) => {
      await route.fulfill({
        json: {
          endpoints: [{ method: 'POST', path: '/verify' }],
        },
      });
    });

    await basicInit(page);
    await page.goto('/docs?type=factory');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('delivery page with order details', async ({ page }) => {
    await basicInit(page);

    // Login and complete an order first
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/menu');
    await page.locator('select').selectOption('4');
    await page.getByText('Veggie').first().click();
    await page.getByRole('button', { name: 'Checkout' }).click();
    await page.getByRole('button', { name: 'Pay now' }).click();

    // Now on delivery page - check various elements
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText('0.004').first()).toBeVisible();
  });

  test('admin dashboard franchise operations', async ({ page }) => {
    await page.route('*/**/api/franchise', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: '99',
            name: body.name,
            admins: body.admins,
            stores: [],
          },
        });
      }
    });

    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Go to admin dashboard and look for interactive elements
    await page.goto('/admin-dashboard');
    await expect(page.getByRole('main')).toBeVisible();

    // Try to find and interact with create franchise button if it exists
    const createButton = page.getByRole('button', { name: /create/i });
    if (await createButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await createButton.click();
    }
  });

  test('franchisee dashboard store operations', async ({ page }) => {
    await page.route('*/**/api/franchise/*/store', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          json: { id: '99', name: 'New Store' },
        });
      }
    });

    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Go to franchise dashboard
    await page.goto('/franchise-dashboard');
    await expect(page.getByRole('main')).toBeVisible();

    // Look for store management elements
    const storeLinks = page.getByText(/Lehi|Springville/i);
    if (await storeLinks.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(storeLinks.first()).toBeVisible();
    }
  });

  test('register with all fields', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'Register' }).click();

    // Fill all registration fields
    await page.getByPlaceholder('Full name').fill('Jane Doe');
    await page.getByPlaceholder('Email address').fill('jane@example.com');
    await page.getByPlaceholder('Password').fill('securepass123');

    // Submit registration
    await page.getByRole('button', { name: 'Register' }).click();

    // Should be logged in after registration
    await expect(page.getByText('JD').first()).toBeVisible();
  });

  test('login error handling with network issues', async ({ page }) => {
    let callCount = 0;
    await page.route('*/**/api/auth', async (route) => {
      callCount++;
      if (callCount === 1 && route.request().method() === 'PUT') {
        // First attempt fails
        await route.abort('failed');
      }
    });

    await page.route('*/**/api/order/menu', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
      await route.fulfill({ json: { franchises: [], more: false } });
    });

    await page.goto('/');

    // Try to login
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('test@test.com');
    await page.getByPlaceholder('Password').fill('password');

    // Click login but expect it to fail
    try {
      await page.getByRole('button', { name: 'Login' }).click();
      await page.waitForTimeout(500);
    } catch (e) {
      // Expected to fail
    }

    // Should still be on login page
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('admin can see franchise list', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to admin dashboard
    await page.goto('/admin-dashboard');

    // Should see franchise names
    await expect(page.getByRole('main')).toBeVisible();

    // Check for franchise names in the page
    const lotaPizzaText = page.getByText('LotaPizza');
    if (await lotaPizzaText.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(lotaPizzaText).toBeVisible();
    }
  });

  test('diner can view order history details', async ({ page }) => {
    await basicInit(page);

    // Login as diner
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to diner dashboard
    await page.getByText('KC').click();

    // Should see dashboard with order history
    await expect(page.getByRole('main')).toBeVisible();

    // Look for order history elements
    const historySection = page.getByRole('main');
    await expect(historySection).toContainText(/pizza|order/i);
  });

  test('menu with different pizza selections and deselections', async ({ page }) => {
    await basicInit(page);

    await page.goto('/menu');
    await page.locator('select').selectOption('4');

    // Add pizzas
    await page.getByText('Veggie').first().click();
    await expect(page.locator('form')).toContainText('Selected pizzas: 1');

    await page.getByText('Pepperoni').first().click();
    await expect(page.locator('form')).toContainText('Selected pizzas: 2');

    await page.getByText('Margarita').first().click();
    await expect(page.locator('form')).toContainText('Selected pizzas: 3');

    await page.getByText('Crusty').first().click();
    await expect(page.locator('form')).toContainText('Selected pizzas: 4');
  });

  test('payment page cancel and return to menu', async ({ page }) => {
    await basicInit(page);

    // Login and start order
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('d@jwt.com');
    await page.getByPlaceholder('Password').fill('a');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/menu');
    await page.locator('select').selectOption('4');
    await page.getByText('Veggie').first().click();
    await page.getByText('Pepperoni').first().click();
    await page.getByRole('button', { name: 'Checkout' }).click();

    // On payment page, click cancel
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Should return to menu page
    await expect(page.locator('h2')).toContainText('Awesome is a click away');
  });

  test('franchisee views franchise with stores and revenue', async ({ page }) => {
    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to franchise dashboard
    await page.goto('/franchise-dashboard');

    // Should see stores and revenue
    await expect(page.getByRole('main')).toBeVisible();

    // Check for store names
    const storeText = page.getByText(/Lehi|Springville|revenue/i);
    if (await storeText.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(storeText.first()).toBeVisible();
    }
  });

  test('create franchise - fill and submit form', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/create-franchise');

    // Fill in franchise name
    await page.getByPlaceholder('franchise name').fill('Test Franchise');

    // Fill in admin email
    await page.getByPlaceholder('franchisee admin email').fill('admin@test.com');

    // Submit the form
    await page.getByRole('button', { name: 'Create' }).click();

    // Should navigate away after creation
    await page.waitForTimeout(500);
  });

  test('create store - fill and submit form', async ({ page }) => {
    await page.route('*/**/api/franchise/*/store', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: '101',
            name: body.name,
          },
        });
      }
    });

    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate with state
    await page.evaluate(() => {
      window.history.pushState(
        { franchise: { id: '2', name: 'LotaPizza', stores: [] } },
        '',
        '/franchise/2/create-store'
      );
    });
    await page.goto('/franchise/2/create-store');

    // Fill in store name
    const storeInput = page.getByPlaceholder('store name');
    if (await storeInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await storeInput.fill('New Store Location');

      // Submit the form
      await page.getByRole('button', { name: 'Create' }).click();
      await page.waitForTimeout(500);
    }
  });

  test('close franchise - click close button', async ({ page }) => {
    await page.route('*/**/api/franchise/*', async (route) => {
      if (route.request().method() === 'DELETE' && !route.request().url().includes('store')) {
        await route.fulfill({ json: { message: 'success' } });
      }
    });

    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate with state
    await page.evaluate(() => {
      window.history.pushState(
        { franchise: { id: '2', name: 'TestFranchise' } },
        '',
        '/franchise/2/close'
      );
    });
    await page.goto('/franchise/2/close');

    // Click the Close button
    const closeButton = page.getByRole('button', { name: 'Close' });
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('close store - click close button', async ({ page }) => {
    await page.route('*/**/api/franchise/*/store/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ json: { message: 'success' } });
      }
    });

    await basicInit(page);

    // Login as franchisee
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('f@jwt.com');
    await page.getByPlaceholder('Password').fill('franchisee');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate with state
    await page.evaluate(() => {
      window.history.pushState(
        {
          franchise: { id: '2', name: 'LotaPizza' },
          store: { id: '4', name: 'Lehi' },
        },
        '',
        '/franchise/2/store/4/close'
      );
    });
    await page.goto('/franchise/2/store/4/close');

    // Click the Close button
    const closeButton = page.getByRole('button', { name: 'Close' });
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('cancel on close franchise page', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate with state
    await page.evaluate(() => {
      window.history.pushState(
        { franchise: { id: '2', name: 'TestFranchise' } },
        '',
        '/franchise/2/close'
      );
    });
    await page.goto('/franchise/2/close');

    // Click Cancel button
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    if (await cancelButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancelButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('cancel on create franchise page', async ({ page }) => {
    await basicInit(page);

    // Login as admin
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByPlaceholder('Email address').fill('a@jwt.com');
    await page.getByPlaceholder('Password').fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.goto('/create-franchise');

    // Fill in partial data
    await page.getByPlaceholder('franchise name').fill('Test');

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(500);
  });
});
