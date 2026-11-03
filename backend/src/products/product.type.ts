export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  stock: number;
  stockBySize: Record<'S' | 'M' | 'L', number>;
}
