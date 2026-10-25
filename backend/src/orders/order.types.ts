export enum OrderSizeId {
  Small = 'S',
  Medium = 'M',
  Large = 'L',
}

export enum OrderToppingId {
  WhitePearl = 'white_pearl',
  AloeVera = 'aloe_vera',
  Cheese = 'cheese',
}

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'CANCELLED';

export interface OrderOption {
  id: string;
  name: string;
  extraPrice: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  basePrice: number;
  quantity: number;
  size: OrderOption;
  toppings: OrderOption[];
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  orderCode: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  subtotalAmount?: number;
  discountAmount?: number;
  promotionCode?: string;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  pointsEarned?: number;
  createdAt: string;
}
