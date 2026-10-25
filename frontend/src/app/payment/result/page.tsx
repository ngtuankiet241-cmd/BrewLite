
"use client";

import { useCallback, useEffect, useState } from "react";
import { useCart } from "../../../context/CartContext";

type PaymentResult = {
  status: "loading" | "success" | "pending" | "failed" | "error";
  message: string;
};

const API_URL = "http://localhost:3001";

function getPaymentResult(data: unknown): PaymentResult {
  const result = data as {
    status?: string;
    paymentStatus?: string;
    order?: {
      status?: string;
      paymentStatus?: string;
    };
    message?: string;
  };

  const value = String(
    result?.paymentStatus ??
      result?.order?.paymentStatus ??
      result?.status ??
      result?.order?.status ??
      ""
  ).toUpperCase();

  if (["PAID", "SUCCESS", "COMPLETED", "SUCCEEDED"].includes(value)) {
    return {
      status: "success",
      message: "Đơn hàng đã được xác nhận thanh toán thành công.",
    };
  }

  if (
    ["FAILED", "CANCELLED", "CANCELED", "EXPIRED", "ERROR"].includes(value)
  ) {
    return {
      status: "failed",
      message: "Thanh toán thất bại hoặc đã bị hủy.",
    };
  }

  if (
    ["PENDING", "PROCESSING", "UNPAID", "WAITING", ""].includes(value)
  ) {
    return {
      status: "pending",
      message: "Đơn hàng đang chờ xác nhận thanh toán.",
    };
  }

  return {
    status: "pending",
    message: `Trạng thái hiện tại: ${value}`,
  };
}

export default function PaymentResultPage() {
    const { clearCart, isHydrated } = useCart();
  const [orderCode, setOrderCode] = useState("");
  const [result, setResult] = useState<PaymentResult>({
    status: "loading",
    message: "Đang kiểm tra trạng thái đơn hàng...",
  });

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);

    void Promise.resolve().then(() => {
      if (active) {
        setOrderCode(params.get("orderCode") ?? "");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const checkPaymentStatus = useCallback(async () => {
    if (!orderCode) {
      setResult({
        status: "error",
        message: "Không tìm thấy mã đơn hàng trong đường dẫn.",
      });
      return;
    }

    const token = localStorage.getItem("brewlite_access_token");

    if (!token) {
      setResult({
        status: "error",
        message: "Bạn cần đăng nhập lại để kiểm tra trạng thái đơn hàng.",
      });
      return;
    }

    setResult({
      status: "loading",
      message: "Đang kiểm tra trạng thái đơn hàng...",
    });

    try {
      const response = await fetch(
        `${API_URL}/payments/status?orderCode=${encodeURIComponent(orderCode)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
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
      setResult(getPaymentResult(data));
    } catch (error) {
      setResult({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Không thể kết nối đến máy chủ.",
      });
    }
  }, [orderCode]);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (active && orderCode) {
        void checkPaymentStatus();
      }
    });

    return () => {
      active = false;
    };
  }, [orderCode, checkPaymentStatus]);
  useEffect(() => {
  if (!isHydrated) return;

  if (result.status === "success") {
    clearCart();
  }
}, [result.status, isHydrated, clearCart]);

  const appearance = {
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
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-lg text-center">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold ${appearance.color} ${appearance.background}`}
        >
          {appearance.icon}
        </div>

        <h1 className="text-xl font-bold text-stone-900">
          {appearance.title}
        </h1>

        <p className="mt-3 text-sm leading-6 text-stone-600">
          {result.message}
        </p>

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
            window.location.href = "/";
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
