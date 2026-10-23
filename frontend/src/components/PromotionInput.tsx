"use client";

import { useEffect, useRef, useState } from "react";

export interface PromotionQuote {
  code: string;
  orderAmount: number;
  discountAmount: number;
  totalAmount: number;
}

interface PromotionInputProps {
  code: string;
  orderAmount: number;
  quote: PromotionQuote | null;
  disabled: boolean;
  onCodeChange: (code: string) => void;
  onApply: (quote: PromotionQuote) => void;
  onPendingChange: (pending: boolean) => void;
}

export default function PromotionInput({
  code,
  orderAmount,
  quote,
  disabled,
  onCodeChange,
  onApply,
  onPendingChange,
}: PromotionInputProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      onPendingChange(false);
    },
    [onPendingChange],
  );

  const apply = async () => {
    if (!code.trim() || pending || disabled) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    onPendingChange(true);
    onCodeChange(code);
    setError(null);
    try {
      const response = await fetch(
        "http://localhost:3001/promotions/validate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            orderAmount,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          Array.isArray(result.message)
            ? result.message.join(", ")
            : typeof result.message === "string"
              ? result.message
              : "Không thể áp dụng mã khuyến mãi.",
        );
      }
      if (controller.signal.aborted) return;
      onApply(result as PromotionQuote);
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(
        error instanceof Error
          ? error.message
          : "Không thể kiểm tra mã khuyến mãi.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        onPendingChange(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="promotion-code"
        className="text-sm font-semibold text-stone-700"
      >
        Mã khuyến mãi
      </label>
      <div className="flex gap-2">
        <input
          id="promotion-code"
          type="text"
          autoComplete="off"
          maxLength={64}
          placeholder="Nhập mã khuyến mãi"
          value={code}
          disabled={pending || disabled}
          aria-invalid={!!error}
          aria-describedby={error ? "promotion-error" : undefined}
          onChange={(event) => {
            setError(null);
            onCodeChange(event.target.value.toUpperCase());
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void apply();
            }
          }}
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-700 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={pending || disabled || !code.trim()}
          onClick={() => void apply()}
          className="shrink-0 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-200 disabled:opacity-50"
        >
          {pending ? "Đang kiểm tra..." : "Áp dụng"}
        </button>
      </div>
      {error && (
        <p id="promotion-error" role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
      {code.trim() && !quote && !pending && !error && (
        <p className="text-xs text-stone-500">
          Nhấn Áp dụng để kiểm tra mã cho giỏ hàng hiện tại.
        </p>
      )}
      {quote && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 text-xs text-emerald-800"
        >
          <span>Đã áp dụng mã {quote.code}</span>
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => onCodeChange("")}
            className="font-semibold underline"
          >
            Bỏ mã
          </button>
        </div>
      )}
    </div>
  );
}
