"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface CartChoice {
  id: string;
  name: string;
  extraPrice: number;
}

export interface CartItemInput {
  id: string;
  name: string;
  price: number;
  quantity: number;
  size: CartChoice;
  toppings: CartChoice[];
  imageUrl: string;
}

export interface CartItem extends CartItemInput {
  cartItemId: string;
}

interface CartContextValue {
  items: CartItem[];
  totalAmount: number;
  totalItemsCount: number;
  isHydrated: boolean;
  addToCart: (item: CartItemInput) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
}

const CART_STORAGE_KEY = "brewLite.cart";
const CartContext = createContext<CartContextValue | null>(null);

function isCartChoice(value: unknown): value is CartChoice {
  if (!value || typeof value !== "object") return false;
  const choice = value as Partial<CartChoice>;
  return (
    typeof choice.id === "string" &&
    typeof choice.name === "string" &&
    typeof choice.extraPrice === "number" &&
    Number.isFinite(choice.extraPrice)
  );
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.cartItemId === "string" &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    isCartChoice(item.size) &&
    Array.isArray(item.toppings) &&
    item.toppings.every(isCartChoice) &&
    typeof item.imageUrl === "string"
  );
}

function sameConfiguration(left: CartItem, right: CartItemInput): boolean {
  if (left.id !== right.id || left.size.id !== right.size.id) return false;
  const leftToppings = left.toppings.map(({ id }) => id).sort();
  const rightToppings = right.toppings.map(({ id }) => id).sort();
  return (
    leftToppings.length === rightToppings.length &&
    leftToppings.every((id, index) => id === rightToppings[index])
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) {
        const parsed: unknown = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.every(isCartItem)) {
          // Restore persisted client state once, after the server render.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItems(parsed);
        } else {
          console.error("Dữ liệu giỏ hàng trong localStorage không hợp lệ.");
        }
      }
    } catch (error) {
      console.error("Không thể khôi phục giỏ hàng từ localStorage:", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Không thể lưu giỏ hàng vào localStorage:", error);
    }
  }, [isHydrated, items]);

  const addToCart = useCallback((item: CartItemInput) => {
    setItems((currentItems) => {
      const existingItem = currentItems.find((existing) =>
        sameConfiguration(existing, item)
      );

      if (existingItem) {
        return currentItems.map((existing) =>
          existing.cartItemId === existingItem.cartItemId
            ? { ...existing, quantity: existing.quantity + item.quantity }
            : existing
        );
      }

      return [
        ...currentItems,
        { ...item, toppings: [...item.toppings], cartItemId: crypto.randomUUID() },
      ];
    });
  }, []);

  const updateQuantity = useCallback(
    (cartItemId: string, quantity: number) => {
      if (!Number.isFinite(quantity)) {
        console.error("Số lượng món trong giỏ hàng phải là một số hữu hạn.");
        return;
      }

      const normalizedQuantity = Math.floor(quantity);
      setItems((currentItems) =>
        normalizedQuantity <= 0
          ? currentItems.filter((item) => item.cartItemId !== cartItemId)
          : currentItems.map((item) =>
              item.cartItemId === cartItemId
                ? { ...item, quantity: normalizedQuantity }
                : item
            )
      );
    },
    []
  );

  const removeFromCart = useCallback((cartItemId: string) => {
    setItems((currentItems) =>
      currentItems.filter((item) => item.cartItemId !== cartItemId)
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalAmount: items.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      ),
      totalItemsCount: items.reduce((total, item) => total + item.quantity, 0),
      isHydrated,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
    }),
    [
      items,
      isHydrated,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart phải được sử dụng bên trong CartProvider.");
  }
  return context;
}
