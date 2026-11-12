export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: string;
  stock: number;
  stockBySize: Record<'S' | 'M' | 'L', number>;
}
