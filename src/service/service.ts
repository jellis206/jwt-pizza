import httpPizzaService from './httpPizzaService';
import type { PizzaService } from './pizzaService';

let pizzaService: PizzaService = httpPizzaService;
export { pizzaService };
