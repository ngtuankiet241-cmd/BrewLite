
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "../../../context/CartContext";
import { API_URL } from "../../../config/api";
import { getPaymentResult, type PaymentResult } from "../../../lib/payment-result";

async function fetchPaymentResult(orderCode: string, signal?: AbortSignal): Promise<PaymentResult> {
    if (!orderCode) {
      return {
        status: "error",
        message: "Không tìm thấy mã đơn hàng trong đường dẫn.",
      };
    }

    const token = localStorage.getItem("brewlite_access_token");

    if (!token) {
      return {
        status: "error",
        message: "Bạn cần đăng nhập lại để kiểm tra trạng thái đơn hàng.",
      };
    }

    try {
      const response = await fetch(
        `${API_URL}/payments/status?orderCode=${encodeURIComponent(orderCode)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal,
        }
      );

      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? "Phiên đăng nhập không hợp lệ hoặc không có quyền kiểm tra đơn hàng."
            : `Không thể kiểm tra đơn hàng (HTTP ${response.status}).`
        );
      }

      const data: unknown = await response.json();
      return getPaymentResult(data);
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Không thể kết nối đến máy chủ.",
      };
    }
}

function PaymentResultContent() {
  const { clearCart, isHydrated } = useCart();
  const router = useRouter();
  const params = useSearchParams();
  const orderCode = params.get("orderCode") ?? "";
  const [result, setResult] = useState<PaymentResult>({
    status: "loading", message: "Đang kiểm tra trạng thái đơn hàng...",
  });

  const checkPaymentStatus = () => {
    setResult({ status: "loading", message: "Đang kiểm tra trạng thái đơn hàng..." });
    void fetchPaymentResult(orderCode).then(setResult);
  };

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const load = async () => {
      const next = await fetchPaymentResult(orderCode, controller.signal);
      if (controller.signal.aborted) return;
      setResult(next);
      if ((next.status === "pending" || next.refundPending) && attempts++ < 30) timer = setTimeout(load, next.refundPending ? 5000 : 2000);
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [orderCode]);
  useEffect(() => {
  if (!isHydrated) return;

  if (result.status === "success") {
    clearCart();
  }
}, [result.status, isHydrated, clearCart]);

  const appearance = {
    cancelled: {
      icon: "×",
      title: "Đơn hàng đã hủy",
      color: "text-stone-700",
      background: "bg-stone-100",
    },
    loading: {
      icon: "…",
      title: "Đang kiểm tra",
      color: "text-blue-700",
      background: "bg-blue-50",
    },
    success: {
      icon: "✓",
      title: "Thanh toán thành công",
      color: "text-emerald-700",
      background: "bg-emerald-50",
    },
    pending: {
      icon: "◷",
      title: "Đang chờ thanh toán",
      color: "text-amber-700",
      background: "bg-amber-50",
    },
    failed: {
      icon: "×",
      title: "Thanh toán thất bại",
      color: "text-red-700",
      background: "bg-red-50",
    },
    error: {
      icon: "!",
      title: "Không thể kiểm tra",
      color: "text-red-700",
      background: "bg-red-50",
    },
  }[result.status];

  return (
    <main className="min-h-screen bg-stone-100 flex items-center justify-center p-4 text-stone-800">
      <section className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-lg text-center">
        <Link
          href="/orders/history"
          aria-label="Đóng và về lịch sử mua hàng"
          title="Về lịch sử mua hàng"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </Link>

        {result.status !== "cancelled" && <div
          aria-hidden="true"
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold ${appearance.color} ${appearance.background}`}
        >
          {result.status === "failed" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-8 w-8">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          ) : appearance.icon}
        </div>}

        <h1 className={`text-xl font-bold text-stone-900 ${result.status === "cancelled" ? "mt-7" : ""}`}>
          {appearance.title}
        </h1>

        {result.message && <p className="mt-3 text-sm leading-6 text-stone-600">
          {result.message}
        </p>}

        {orderCode && (
          <div className="mt-6 rounded-xl bg-stone-50 p-4 text-left">
            <p className="text-xs text-stone-500">Mã đơn hàng</p>
            <p className="mt-1 break-all font-semibold text-stone-900">
              {orderCode}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={checkPaymentStatus}
          disabled={result.status === "loading" || !orderCode}
          className="mt-6 w-full rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Kiểm tra lại trạng thái
        </button>

        <button
          type="button"
          onClick={() => {
            router.push("/");
          }}
          className="mt-3 w-full rounded-xl border border-stone-200 px-4 py-3 font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Trở về trang chủ
        </button>

        <p className="mt-5 text-xs leading-5 text-stone-400">
          Trạng thái thanh toán được lấy từ máy chủ BrewLite. Việc quay lại
          trang này không tự động xác nhận đơn hàng đã thanh toán.
        </p>
      </section>
    </main>
  );
}

export default function PaymentResultPage() {
  return <Suspense fallback={<p className="p-8 text-center">Đang kiểm tra thanh toán...</p>}>
    <PaymentResultContent />
  </Suspense>;
}
