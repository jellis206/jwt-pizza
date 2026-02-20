import { test, expect, Page } from 'playwright-test-coverage';

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

test('updateUser - register, navigate to dashboard, edit name', async ({ page }) => {
  const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;
  let storedUser = { id: '100', name: 'pizza diner', email, password: 'diner', roles: [{ role: Role.Diner }] };

  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      storedUser = { id: '100', name: body.name, email: body.email, password: body.password, roles: [{ role: Role.Diner }] };
      await route.fulfill({
        json: {
          user: { id: storedUser.id, name: storedUser.name, email: storedUser.email, roles: storedUser.roles },
          token: 'tok123',
        },
      });
    } else if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      storedUser = { ...storedUser, ...body };
      await route.fulfill({
        json: {
          user: { id: storedUser.id, name: storedUser.name, email: storedUser.email, roles: storedUser.roles },
          token: 'tok456',
        },
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({
      json: { id: storedUser.id, name: storedUser.name, email: storedUser.email, roles: storedUser.roles },
    });
  });

  await page.route(/\/api\/user\/\d+$/, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      storedUser = { ...storedUser, ...body };
      await route.fulfill({
        json: {
          user: { id: storedUser.id, name: storedUser.name, email: storedUser.email, roles: storedUser.roles },
          token: 'tok789',
        },
      });
    }
  });

  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('*/**/api/order', async (route) => {
    await route.fulfill({ json: { dinerId: '100', orders: [], page: 0 } });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { franchises: [], more: false } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Register' }).click();

  await page.getByRole('link', { name: 'pd' }).click();

  await expect(page.getByRole('main')).toContainText('pizza diner');

  // Open edit dialog
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');

  // Change name
  await page.getByRole('textbox').first().fill('pizza dinerx');
  await page.getByRole('button', { name: 'Update' }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('updateUser - dialog opens and closes without changes', async ({ page }) => {
  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          user: { id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] },
          token: 'abcdef',
        },
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: { id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] } });
  });

  await page.route(/\/api\/user\/\d+$/, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          user: { id: '3', name: body.name || 'Kai Chen', email: body.email || 'd@jwt.com', roles: [{ role: Role.Diner }] },
          token: 'newtoken',
        },
      });
    }
  });

  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('*/**/api/order', async (route) => {
    await route.fulfill({ json: { dinerId: '3', orders: [], page: 0 } });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { franchises: [], more: false } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByText('KC').click();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');

  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('Kai Chen');
});

test('admin dashboard shows users section', async ({ page }) => {
  const adminUsers = [
    { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] },
    { id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] },
  ];

  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          user: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] },
          token: 'admintoken',
        },
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] } });
  });

  // Match /api/user with optional query params (for user list)
  await page.route(/\/api\/user\b(?!\/)/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { users: adminUsers, more: false } });
    }
  });

  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { franchises: [], more: false } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill('a@jwt.com');
  await page.getByPlaceholder('Password').fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'Admin' }).click();

  await expect(page.getByRole('main')).toContainText('Users');
  await expect(page.getByRole('main')).toContainText('Kai Chen');
  await expect(page.getByRole('main')).toContainText('d@jwt.com');
});

test('admin can filter users by name', async ({ page }) => {
  const allUsers = [
    { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] },
    { id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] },
  ];

  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          user: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] },
          token: 'admintoken',
        },
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] } });
  });

  await page.route(/\/api\/user\b(?!\/)/, async (route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url();
      const urlObj = new URL(url);
      const nameFilter = urlObj.searchParams.get('name') || '*';
      const filterStr = nameFilter.replace(/[%*]/g, '').toLowerCase();

      const filtered = filterStr === '' ? allUsers : allUsers.filter((u) => u.name.toLowerCase().includes(filterStr));

      await route.fulfill({ json: { users: filtered, more: false } });
    }
  });

  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { franchises: [], more: false } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill('a@jwt.com');
  await page.getByPlaceholder('Password').fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'Admin' }).click();

  // Should see both users initially
  await expect(page.getByRole('main')).toContainText('Kai Chen');

  // Filter by "Kai" - click the Submit button near the user filter
  await page.getByPlaceholder('Filter users').fill('Kai');
  await page.getByRole('button', { name: 'Submit' }).last().click();

  await expect(page.getByRole('main')).toContainText('Kai Chen');
  await expect(page.getByRole('main')).not.toContainText('Admin User');
});

test('admin can delete a user', async ({ page }) => {
  let users = [
    { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] },
    { id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] },
  ];

  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          user: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] },
          token: 'admintoken',
        },
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] } });
  });

  await page.route(/\/api\/user\b(?!\/)/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { users, more: false } });
    }
  });

  await page.route(/\/api\/user\/\d+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      const url = route.request().url();
      const userId = url.split('/').pop()?.split('?')[0];
      users = users.filter((u) => u.id !== userId);
      await route.fulfill({ json: { message: 'user deleted' } });
    }
  });

  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { franchises: [], more: false } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill('a@jwt.com');
  await page.getByPlaceholder('Password').fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'Admin' }).click();

  await expect(page.getByRole('main')).toContainText('Kai Chen');

  // Handle the confirm dialog
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  // Click delete for Kai Chen (last Delete button)
  const deleteButtons = page.getByRole('button', { name: 'Delete' });
  await deleteButtons.last().click();

  // After delete, user list should refresh (no more Kai Chen)
  await expect(page.getByRole('main')).not.toContainText('Kai Chen');
});

test('admin can paginate user list', async ({ page }) => {
  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          user: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] },
          token: 'admintoken',
        },
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  await page.route('*/**/api/user/me', async (route) => {
    await route.fulfill({ json: { id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] } });
  });

  await page.route(/\/api\/user\b(?!\/)/, async (route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url();
      const urlObj = new URL(url);
      const currentPage = parseInt(urlObj.searchParams.get('page') || '0');

      const page0Users = [{ id: '1', name: 'Admin User', email: 'a@jwt.com', roles: [{ role: Role.Admin }] }];
      const page1Users = [{ id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] }];

      await route.fulfill({
        json: {
          users: currentPage === 0 ? page0Users : page1Users,
          more: currentPage === 0,
        },
      });
    }
  });

  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { franchises: [], more: false } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill('a@jwt.com');
  await page.getByPlaceholder('Password').fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'Admin' }).click();

  // Should see first page content
  await expect(page.getByRole('main')).toContainText('Admin User');

  // Click next page (») for the Users section (last »)
  await page.getByRole('button', { name: '»' }).last().click();

  await expect(page.getByRole('main')).toContainText('Kai Chen');
});
