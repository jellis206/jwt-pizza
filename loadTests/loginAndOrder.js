import { sleep, check, group, fail } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
};

const BASE_URL = 'https://pizza-service.urjellis.com';
const FACTORY_URL = 'https://pizza-factory.cs329.click';

export default function () {
  const vars = {};

  group('login', () => {
    const response = http.put(
      `${BASE_URL}/api/auth`,
      JSON.stringify({ email: 'd@jwt.com', password: 'diner' }),
      {
        headers: {
          'Content-Type': 'application/json',
          accept: '*/*',
          origin: 'https://pizza.urjellis.com',
        },
      }
    );

    if (
      !check(response, {
        'login status equals 200': (r) => r.status === 200,
      })
    ) {
      console.log(response.body);
      fail('Login was not 200');
    }

    vars.authToken = response.json('token');
  });

  sleep(1);

  group('menu', () => {
    const response = http.get(`${BASE_URL}/api/order/menu`, {
      headers: {
        accept: '*/*',
        authorization: `Bearer ${vars.authToken}`,
        origin: 'https://pizza.urjellis.com',
      },
    });

    check(response, { 'menu status equals 200': (r) => r.status === 200 });
  });

  sleep(1);

  group('purchase pizza', () => {
    const response = http.post(
      `${BASE_URL}/api/order`,
      JSON.stringify({
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: 'Veggie', price: 0.0038 }],
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          accept: '*/*',
          authorization: `Bearer ${vars.authToken}`,
          origin: 'https://pizza.urjellis.com',
        },
      }
    );

    if (
      !check(response, {
        'order status equals 200': (r) => r.status === 200,
      })
    ) {
      console.log(response.body);
      fail('Order was not 200');
    }

    vars.pizzaJwt = response.json('jwt');
  });

  sleep(1);

  group('verify pizza', () => {
    const response = http.post(
      `${FACTORY_URL}/api/order/verify`,
      JSON.stringify({ jwt: vars.pizzaJwt }),
      {
        headers: {
          'Content-Type': 'application/json',
          accept: '*/*',
          authorization: `Bearer ${vars.authToken}`,
          origin: 'https://pizza.urjellis.com',
        },
      }
    );

    check(response, { 'verify status equals 200': (r) => r.status === 200 });
  });

  sleep(1);
}
