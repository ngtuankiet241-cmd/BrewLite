"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "../context/CartContext";
import PromotionInput, { type PromotionQuote } from "./PromotionInput";
import { API_URL, fetchAccount, type Account } from "../lib/account";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
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

export default function CartDrawer({
  isOpen,
  onClose,
  onOrderCreated,
}: CartDrawerProps) {
  const router = useRouter();
  const {
    items,
    totalAmount,
    totalItemsCount,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();
  const [currentOrderCode, setCurrentOrderCode] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [confirmedTotal, setConfirmedTotal] = useState<number | null>(null);
  const [pointsSelection, setPointsSelection] = useState<{
    cartItems: typeof items; promotionCode: string | undefined; points: number;
  } | null>(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [isValidatingPromotion, setIsValidatingPromotion] = useState(false);
  const [promotionSelection, setPromotionSelection] = useState<{
    cartItems: typeof items;
    quote: PromotionQuote;
  } | null>(null);
  const cartKey = JSON.stringify(items);
  const appliedPromotion =
    promotionSelection?.cartItems === items ? promotionSelection.quote : null;
  const pointsToRedeem = pointsSelection?.cartItems === items &&
    pointsSelection.promotionCode === appliedPromotion?.code ? pointsSelection.points : 0;
  const afterPromotion = appliedPromotion?.totalAmount ?? totalAmount;
  const pointValue = account?.loyaltyPolicy.pointValue ?? 10;
  const maxPoints = Math.min(account?.loyaltyPoints ?? 0, Math.floor(afterPromotion / pointValue));
  const invalidPoints = !currentOrderCode && pointsToRedeem > maxPoints;
  const pointsDiscount = pointsToRedeem * pointValue;
  const payableAmount = confirmedTotal ?? Math.max(0, afterPromotion - pointsDiscount);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchAccount(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setAccount(data);
      setPointsError(null);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setAccount(null);
      setPointsError(error instanceof Error ? error.message : "Không thể tải điểm thưởng.");
    });
    return () => controller.abort();
  }, [isOpen]);

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
    if (currentOrderCode) return;
    clearCart();
    setCheckoutNotice(null);
    setPromotionCode("");
    setPromotionSelection(null);
  };

  const handleCreateOrder = async () => {
    if (items.length === 0 || isSubmittingOrder || isValidatingPromotion || currentOrderCode || invalidPoints) return;

    const token = localStorage.getItem("brewlite_access_token");
    if (!token) {
      setCheckoutNotice("Vui lòng đăng nhập trước khi đặt hàng.");
      return;
    }

    setCheckoutNotice(null);
    setIsSubmittingOrder(true);
    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(appliedPromotion ? { promotionCode: appliedPromotion.code } : {}),
          pointsToRedeem,
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            sizeId: item.size.id,
            toppingIds: item.toppings.map((topping) => topping.id),
          })),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "message" in result
            ? result.message
            : null;
        throw new Error(
          typeof message === "string"
            ? message
            : Array.isArray(message)
              ? message.join(", ")
              : `Không thể tạo đơn (HTTP ${response.status}).`,
        );
      }
      if (
        typeof result !== "object" || result === null ||
        !("orderCode" in result) || typeof result.orderCode !== "string" ||
        !("status" in result) || !["PENDING", "PAID"].includes(String(result.status)) ||
        !("totalAmount" in result) || typeof result.totalAmount !== "number"
      ) {
        throw new Error("Máy chủ trả về thông tin đơn hàng không hợp lệ.");
      }
      setCurrentOrderCode(result.orderCode);
      setConfirmedTotal(result.totalAmount);
      onOrderCreated();
      if (result.status === "PAID") {
        clearCart();
        router.push(`/payment/result?orderCode=${encodeURIComponent(result.orderCode)}`);
        return;
      }
      setCheckoutNotice(`Tạo đơn thành công: ${result.orderCode}. Vui lòng thanh toán.`);
      // Keep the cart until payment is completed or explicitly handled.
    } catch (error) {
      setCheckoutNotice(
        error instanceof Error
          ? `Không thể tạo đơn: ${error.message}. Giỏ hàng vẫn được giữ để thử lại.`
          : "Không thể kết nối máy chủ để tạo đơn. Giỏ hàng vẫn được giữ để thử lại.",
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handlePayment = async () => {
  if (!currentOrderCode || isSubmittingPayment) return;

  setIsSubmittingPayment(true);
  setCheckoutNotice(null);

  try {
    const token = localStorage.getItem("brewlite_access_token");

    if (!token) {
      throw new Error("Vui lòng đăng nhập trước khi thanh toán.");
    }

    const response = await fetch(`${API_URL}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        orderCode: currentOrderCode,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Không thể khởi tạo thanh toán."
      );
    }

    if (
      !data.checkoutUrl ||
      !data.formFields ||
      typeof data.formFields !== "object"
    ) {
      throw new Error("Dữ liệu thanh toán từ server không hợp lệ.");
    }

    // Tạo form POST theo các trường do SDK SePay trả về.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = data.checkoutUrl;

    for (const [key, value] of Object.entries(data.formFields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = String(value ?? "");
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
  } catch (error) {
    setCheckoutNotice(
      error instanceof Error
        ? error.message
        : "Đã xảy ra lỗi khi khởi tạo thanh toán."
    );
    setIsSubmittingPayment(false);
  }
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
            <h2
              id="cart-title"
              className="text-lg font-extrabold text-stone-900"
            >
              Giỏ hàng
            </h2>
            <p className="text-xs text-stone-500">{totalItemsCount} món</p>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && !currentOrderCode && (
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
                      onClick={() => { if (!currentOrderCode) removeFromCart(item.cartItemId); }}
                      disabled={Boolean(currentOrderCode)}
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
                      updateQuantity={currentOrderCode ? () => {} : updateQuantity}
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

       {checkoutNotice && (
  <p
    role="status"
    className="mx-4 mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"
  >
    {checkoutNotice}
  </p>
)}

        {items.length > 0 && (
          <footer className="space-y-3 border-t border-stone-200 bg-white/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {!currentOrderCode && (
              <PromotionInput
                key={cartKey}
                code={promotionCode}
                orderAmount={totalAmount}
                quote={appliedPromotion}
                disabled={isSubmittingOrder}
                onCodeChange={(code) => {
                  setPromotionCode(code);
                  setPromotionSelection(null);
                }}
                onApply={(quote) => setPromotionSelection({ cartItems: items, quote })}
                onPendingChange={setIsValidatingPromotion}
              />
            )}
            {!currentOrderCode && (
              <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor="reward-points" className="font-semibold text-emerald-950">Dùng điểm thưởng</label>
                  <span className="text-emerald-800">{account?.loyaltyPoints.toLocaleString("vi-VN") ?? "—"} điểm</span>
                </div>
                <div className="flex gap-2">
                  <input id="reward-points" type="number" inputMode="numeric" min={0} max={maxPoints} step={1}
                    value={pointsToRedeem}
                    disabled={!account || isSubmittingOrder}
                    onChange={(event) => {
                      const points = Number(event.target.value);
                      if (Number.isSafeInteger(points) && points >= 0) {
                        setPointsSelection({ cartItems: items, promotionCode: appliedPromotion?.code, points });
                      }
                    }}
                    aria-invalid={invalidPoints}
                    className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                  />
                  <button type="button" disabled={!account || isSubmittingOrder}
                    onClick={() => setPointsSelection({ cartItems: items, promotionCode: appliedPromotion?.code, points: maxPoints })}
                    className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-900 disabled:opacity-50">Dùng tối đa</button>
                </div>
                <p className="text-xs text-stone-600">1 điểm = {formatPriceVND(pointValue)}. Điểm được trừ khi tạo đơn và hoàn lại khi hủy đơn.</p>
                {pointsError && <p role="status" className="text-xs text-amber-800">{pointsError}</p>}
                {invalidPoints && <p role="alert" className="text-xs text-rose-700">Chỉ có thể dùng tối đa {maxPoints.toLocaleString("vi-VN")} điểm cho đơn này.</p>}
              </div>
            )}
            {appliedPromotion && (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-stone-600">
                  <span>Tạm tính</span>
                  <span>{formatPriceVND(totalAmount)}</span>
                </div>
                <div className="flex justify-between text-emerald-800">
                  <span>Giảm giá ({appliedPromotion.code})</span>
                  <span>−{formatPriceVND(appliedPromotion.discountAmount)}</span>
                </div>
              </div>
            )}
            {pointsToRedeem > 0 && (
              <div className="flex justify-between text-sm text-emerald-800">
                <span>Giảm từ {pointsToRedeem.toLocaleString("vi-VN")} điểm</span>
                <span>−{formatPriceVND(pointsDiscount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-600">Tổng thanh toán</span>
              <span className="text-lg font-extrabold text-emerald-950">
                {formatPriceVND(payableAmount)}
              </span>
            </div>
            {account && <p className="text-xs text-stone-500">Nhận {Math.floor(payableAmount / account.loyaltyPolicy.spendPerPoint).toLocaleString("vi-VN")} điểm sau khi thanh toán thành công.</p>}
            {!currentOrderCode ? (
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={isSubmittingOrder || isValidatingPromotion || invalidPoints}
                className="w-full rounded-2xl bg-emerald-800 px-5 py-3.5 text-sm font-extrabold text-white disabled:opacity-70"
              >
                {isSubmittingOrder ? "Đang tạo đơn..." : "Tiến hành đặt hàng"}
              </button>
            ) : (
              <div className="space-y-3 rounded-2xl border border-stone-200 p-3">
                <h3 className="font-bold text-stone-900">Thanh toán đơn hàng</h3>
                <p className="text-sm">Mã đơn hàng: <strong>{currentOrderCode}</strong></p>
                <button
                  type="button"
                  onClick={handlePayment}
                  disabled={isSubmittingPayment}
                  className="w-full rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {isSubmittingPayment ? "Đang chuyển đến SePay..." : "Thanh toán với SePay Sandbox"}
                </button>
              </div>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
