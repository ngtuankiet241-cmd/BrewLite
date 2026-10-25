import type { Product } from './product.type.js';

export const PRODUCTS: Omit<Product, 'stock'>[] = [
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
