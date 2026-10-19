"use client";

import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatPriceVND = (price: number): string =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);

function CartQuantityControl({
  cartItemId,
  quantity,
  name,
  updateQuantity,
}: {
  cartItemId: string;
  quantity: number;
  name: string;
  updateQuantity: (cartItemId: string, quantity: number) => void;
}) {
  const [quantityInput, setQuantityInput] = useState(String(quantity));

  const update = (nextQuantity: number) => {
    updateQuantity(cartItemId, nextQuantity);
    setQuantityInput(String(nextQuantity));
  };

  const handleInputChange = (value: string) => {
    setQuantityInput(value);
    if (!/^\d+$/.test(value)) return;

    const parsedQuantity = Number(value);
    if (Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0) {
      updateQuantity(cartItemId, parsedQuantity);
    }
  };

  const handleInputBlur = () => {
    const parsedQuantity = Number(quantityInput);
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1) {
      setQuantityInput(String(quantity));
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-stone-100 p-1">
      <button
        type="button"
        onClick={() => update(Math.max(0, quantity - 1))}
        aria-label={`Giảm số lượng ${name}`}
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-bold text-stone-800"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Nhập số lượng ${name}`}
        value={quantityInput}
        onChange={(event) => handleInputChange(event.target.value)}
        onBlur={handleInputBlur}
        className="h-7 w-12 rounded-lg border border-stone-200 bg-white text-center text-sm font-bold text-stone-900 outline-none focus:border-emerald-700"
      />
      <button
        type="button"
        onClick={() => update(quantity + 1)}
        aria-label={`Tăng số lượng ${name}`}
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-bold text-stone-800"
      >
        +
      </button>
    </div>
  );
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const {
    items,
    totalAmount,
    totalItemsCount,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleClearCart = () => {
    clearCart();
    setCheckoutNotice(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-center">
      <button
        type="button"
        aria-label="Đóng giỏ hàng"
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        className="relative mt-auto flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border border-stone-200 bg-[#FCFBF8] shadow-2xl sm:my-auto sm:max-h-[85vh] sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 id="cart-title" className="text-lg font-extrabold text-stone-900">
              Giỏ hàng
            </h2>
            <p className="text-xs text-stone-500">{totalItemsCount} món</p>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="rounded-lg px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Xóa tất cả
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-700 hover:bg-stone-200"
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center">
              <span className="mb-3 text-4xl" aria-hidden="true">
                🛍️
              </span>
              <p className="font-bold text-stone-800">Giỏ hàng đang trống</p>
              <p className="mt-1 text-sm text-stone-500">
                Hãy chọn món bạn yêu thích nhé.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900"
              >
                Tiếp tục chọn món
              </button>
            </div>
          ) : (
            items.map((item) => (
              <article
                key={item.cartItemId}
                className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-3"
              >
                <div
                  role="img"
                  aria-label={item.name}
                  className="h-20 w-20 shrink-0 rounded-xl bg-cover bg-center bg-stone-100"
                  style={{ backgroundImage: `url("${item.imageUrl}")` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-stone-900">
                        {item.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-stone-500">
                        Size {item.size.name}
                        {item.toppings.length > 0 &&
                          ` · ${item.toppings.map((topping) => topping.name).join(", ")}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.cartItemId)}
                      aria-label={`Xóa ${item.name} khỏi giỏ`}
                      className="shrink-0 rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <CartQuantityControl
                      cartItemId={item.cartItemId}
                      quantity={item.quantity}
                      name={item.name}
                      updateQuantity={updateQuantity}
                    />
                    <span className="text-sm font-extrabold text-emerald-900">
                      {formatPriceVND(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {items.length > 0 && (
          <footer className="space-y-3 border-t border-stone-200 bg-white/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-600">
                Tổng thanh toán
              </span>
              <span className="text-lg font-extrabold text-emerald-950">
                {formatPriceVND(totalAmount)}
              </span>
            </div>
            {checkoutNotice && (
              <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                {checkoutNotice}
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                setCheckoutNotice(
                  "Giỏ hàng đã sẵn sàng. Tính năng đặt hàng sẽ hoạt động khi backend được tích hợp."
                )
              }
              className="w-full rounded-2xl bg-emerald-800 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-950/15 transition-colors hover:bg-emerald-900"
            >
              Tiến hành đặt hàng
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
