import type {
  PizzaService,
  Franchise,
  FranchiseList,
  UserList,
  Store,
  OrderHistory,
  User,
  Menu,
  Order,
  Endpoints,
  OrderResponse,
  JWTPayload,
} from './pizzaService';

const pizzaServiceUrl = import.meta.env.VITE_PIZZA_SERVICE_URL;
const pizzaFactoryUrl = import.meta.env.VITE_PIZZA_FACTORY_URL;

class HttpPizzaService implements PizzaService {
  async callEndpoint<T>(path: string, method: string = 'GET', body?: unknown): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        const authToken = localStorage.getItem('token');
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const options: RequestInit = {
          method,
          headers,
          credentials: 'include',
          ...(body !== undefined && { body: JSON.stringify(body) }),
        };

        if (!path.startsWith('http')) {
          path = pizzaServiceUrl + path;
        }

        const r = await fetch(path, options);
        const j = await r.json();
        if (r.ok) {
          resolve(j as T);
        } else {
          reject({ code: r.status, message: j.message });
        }
      } catch (e: unknown) {
        reject({ code: 500, message: e instanceof Error ? e.message : 'Unknown error' });
      }
    });
  }

  async login(email: string, password: string): Promise<User> {
    const { user, token } = await this.callEndpoint<{ user: User; token: string }>('/api/auth', 'PUT', {
      email,
      password,
    });
    localStorage.setItem('token', token);
    return Promise.resolve(user);
  }

  async register(name: string, email: string, password: string): Promise<User> {
    const { user, token } = await this.callEndpoint<{ user: User; token: string }>('/api/auth', 'POST', {
      name,
      email,
      password,
    });
    localStorage.setItem('token', token);
    return Promise.resolve(user);
  }

  logout(): void {
    this.callEndpoint('/api/auth', 'DELETE');
    localStorage.removeItem('token');
  }

  async updateUser(updatedUser: User): Promise<User> {
    const { user, token } = await this.callEndpoint<{ user: User; token: string }>(
      `/api/user/${updatedUser.id}`,
      'PUT',
      updatedUser
    );
    localStorage.setItem('token', token);
    return Promise.resolve(user);
  }

  async deleteUser(userId: string): Promise<void> {
    return this.callEndpoint<void>(`/api/user/${userId}`, 'DELETE');
  }

  async getUsers(page: number = 0, limit: number = 10, nameFilter: string = '*'): Promise<UserList> {
    return this.callEndpoint<UserList>(`/api/user?page=${page}&limit=${limit}&name=${nameFilter}`);
  }

  async getUser(): Promise<User | null> {
    let result: User | null = null;
    if (localStorage.getItem('token')) {
      try {
        result = await this.callEndpoint<User>('/api/user/me');
      } catch (_e) {
        localStorage.removeItem('token');
      }
    }
    return Promise.resolve(result);
  }

  async getMenu(): Promise<Menu> {
    return this.callEndpoint<Menu>('/api/order/menu');
  }

  async getOrders(_user: User): Promise<OrderHistory> {
    return this.callEndpoint<OrderHistory>('/api/order');
  }

  async order(order: Order): Promise<OrderResponse> {
    return this.callEndpoint<OrderResponse>('/api/order', 'POST', order);
  }

  async verifyOrder(jwt: string): Promise<JWTPayload> {
    return this.callEndpoint<JWTPayload>(pizzaFactoryUrl + '/api/order/verify', 'POST', { jwt });
  }

  async getFranchise(user: User): Promise<Franchise[]> {
    return this.callEndpoint<Franchise[]>(`/api/franchise/${user.id}`);
  }

  async createFranchise(franchise: Franchise): Promise<Franchise> {
    return this.callEndpoint<Franchise>('/api/franchise', 'POST', franchise);
  }

  async getFranchises(page: number = 0, limit: number = 10, nameFilter: string = '*'): Promise<FranchiseList> {
    return this.callEndpoint<FranchiseList>(`/api/franchise?page=${page}&limit=${limit}&name=${nameFilter}`);
  }

  async closeFranchise(franchise: Franchise): Promise<void> {
    return this.callEndpoint<void>(`/api/franchise/${franchise.id}`, 'DELETE');
  }

  async createStore(franchise: Franchise, store: Store): Promise<Store> {
    return this.callEndpoint<Store>(`/api/franchise/${franchise.id}/store`, 'POST', store);
  }

  async closeStore(franchise: Franchise, store: Store): Promise<null> {
    return this.callEndpoint<null>(`/api/franchise/${franchise.id}/store/${store.id}`, 'DELETE');
  }

  async docs(docType: string): Promise<Endpoints> {
    if (docType === 'factory') {
      return this.callEndpoint<Endpoints>(pizzaFactoryUrl + `/api/docs`);
    }
    return this.callEndpoint<Endpoints>(`/api/docs`);
  }
}

const httpPizzaService = new HttpPizzaService();
export default httpPizzaService;
