import type { Product } from './product.type.js';

export const PRODUCTS: Omit<Product, 'stock' | 'stockBySize' | 'category'>[] = [
  {
    id: 'coffee-milk',
    name: 'Cà phê sữa',
    price: 35000,
    imageUrl:
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=640&q=80',
  },
  {
    id: 'americano',
    name: 'Americano',
    price: 40000,
    imageUrl:
      'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=640&q=80',
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    price: 45000,
    imageUrl:
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=640&q=80',
  },
  {
    id: 'peach-tea',
    name: 'Trà đào',
    price: 39000,
    imageUrl:
      'https://tse4.mm.bing.net/th/id/OIP.2eKh0qFqZc3x1K3x04qW7wHaHa?r=0&rs=1&pid=ImgDetMain&o=7&rm=3',
  },
  {
    id: 'lotus-seed-tea',
    name: 'Trà hạt sen',
    price: 55000,
    imageUrl:
      'https://i.pinimg.com/736x/e8/df/5a/e8df5a69dbf21387cad48fcdd90ce5ff.jpg',
  },
  {
    id: 'Milk-tea',
    name: 'Trà sữa',
    price: 45000,
    imageUrl:
      'https://i.pinimg.com/originals/0b/ce/1e/0bce1e592b464e89ca8ee64336f921b7.jpg',
  },
  {
    id: 'blueberry-soda',
    name: 'Soda việt quất',
    price: 42000,
    imageUrl:
      'https://bizweb.dktcdn.net/100/314/104/articles/soda-viet-quat.jpg?v=1691224529203',
  },
  {
    id: 'Matcha-latte',
    name: 'Matcha Latte',
    price: 50000,
    imageUrl:
      'https://th.bing.com/th/id/OIP.O-oV353WtvKEUeetCJ3kcQHaO0?w=174&h=349&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3',
  },
  {
    id: 'strawberry-tea',
    name: 'Trà dâu tây',
    price: 48000,
    imageUrl:
      'https://tse4.mm.bing.net/th/id/OIP.2xPwMHOa52XyK8czyc7H-wHaF7?r=0&rs=1&pid=ImgDetMain&o=7&rm=3',
  },
  {
    id: 'cantaloupe-tea',
    name: 'Trà dưa lưới',
    price: 50000,
    imageUrl:
      'https://i.vietgiaitri.com/2021/7/24/2-cach-lam-tra-dua-luoi-tuoi-mat-thanh-nhiet-uong-vao-cuc-sang-khoai-136-5911023.jpg',
  },
];

export interface IngredientSeed {
  id: string;
  name: string;
  unit: 'g' | 'ml' | 'unit';
  stock: number;
}

export interface ProductRecipeSeed {
  productId: string;
  sizeId: 'S' | 'M' | 'L';
  ingredientId: string;
  quantity: number;
}

export interface ToppingRecipeSeed {
  toppingId: string;
  ingredientId: string;
  quantity: number;
}

export const INGREDIENTS: IngredientSeed[] = [
  { id: 'coffee-beans', name: 'Hạt cà phê', unit: 'g', stock: 5000 },
  { id: 'fresh-milk', name: 'Sữa tươi', unit: 'ml', stock: 20000 },
  { id: 'water', name: 'Nước', unit: 'ml', stock: 100000 },
  { id: 'tea-leaves', name: 'Trà', unit: 'g', stock: 3000 },
  { id: 'peach-syrup', name: 'Siro đào', unit: 'ml', stock: 5000 },
  { id: 'lotus-seeds', name: 'Hạt sen', unit: 'g', stock: 3000 },
  { id: 'milk-tea-powder', name: 'Bột trà sữa', unit: 'g', stock: 5000 },
  { id: 'blueberry-syrup', name: 'Siro việt quất', unit: 'ml', stock: 5000 },
  { id: 'soda-water', name: 'Nước soda', unit: 'ml', stock: 20000 },
  { id: 'matcha-powder', name: 'Bột matcha', unit: 'g', stock: 3000 },
  { id: 'strawberry-syrup', name: 'Siro dâu', unit: 'ml', stock: 5000 },
  { id: 'melon-syrup', name: 'Siro dưa lưới', unit: 'ml', stock: 5000 },
  { id: 'white-pearls', name: 'Trân châu trắng', unit: 'g', stock: 5000 },
  { id: 'aloe-vera', name: 'Thạch nha đam', unit: 'g', stock: 5000 },
  { id: 'cheese-foam', name: 'Kem cheese', unit: 'g', stock: 5000 },
];

const sizes = ['S', 'M', 'L'] as const;

function recipe(
  productId: string,
  ingredientId: string,
  quantities: readonly [number, number, number],
): ProductRecipeSeed[] {
  return sizes.map((sizeId, index) => ({
    productId,
    sizeId,
    ingredientId,
    quantity: quantities[index],
  }));
}

export const PRODUCT_RECIPES: ProductRecipeSeed[] = [
  ...recipe('coffee-milk', 'coffee-beans', [18, 22, 26]),
  ...recipe('coffee-milk', 'fresh-milk', [80, 100, 120]),
  ...recipe('americano', 'coffee-beans', [18, 22, 26]),
  ...recipe('americano', 'water', [150, 200, 250]),
  ...recipe('cappuccino', 'coffee-beans', [18, 22, 26]),
  ...recipe('cappuccino', 'fresh-milk', [120, 150, 180]),
  ...recipe('peach-tea', 'tea-leaves', [3, 4, 5]),
  ...recipe('peach-tea', 'water', [180, 230, 280]),
  ...recipe('peach-tea', 'peach-syrup', [20, 30, 40]),
  ...recipe('lotus-seed-tea', 'tea-leaves', [3, 4, 5]),
  ...recipe('lotus-seed-tea', 'water', [180, 230, 280]),
  ...recipe('lotus-seed-tea', 'lotus-seeds', [20, 30, 40]),
  ...recipe('Milk-tea', 'tea-leaves', [2, 3, 4]),
  ...recipe('Milk-tea', 'milk-tea-powder', [25, 32, 40]),
  ...recipe('Milk-tea', 'fresh-milk', [80, 100, 120]),
  ...recipe('blueberry-soda', 'soda-water', [200, 250, 300]),
  ...recipe('blueberry-soda', 'blueberry-syrup', [25, 32, 40]),
  ...recipe('Matcha-latte', 'matcha-powder', [4, 5, 6]),
  ...recipe('Matcha-latte', 'fresh-milk', [150, 200, 250]),
  ...recipe('strawberry-tea', 'tea-leaves', [3, 4, 5]),
  ...recipe('strawberry-tea', 'water', [180, 230, 280]),
  ...recipe('strawberry-tea', 'strawberry-syrup', [20, 30, 40]),
  ...recipe('cantaloupe-tea', 'tea-leaves', [3, 4, 5]),
  ...recipe('cantaloupe-tea', 'water', [180, 230, 280]),
  ...recipe('cantaloupe-tea', 'melon-syrup', [20, 30, 40]),
];

export const TOPPING_RECIPES: ToppingRecipeSeed[] = [
  { toppingId: 'white_pearl', ingredientId: 'white-pearls', quantity: 30 },
  { toppingId: 'aloe_vera', ingredientId: 'aloe-vera', quantity: 30 },
  { toppingId: 'cheese', ingredientId: 'cheese-foam', quantity: 40 },
];
