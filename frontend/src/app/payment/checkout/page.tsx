"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "../../../lib/account";

type Instructions = {
  accountNumber: string;
  accountName: string;
  bankName: string;
  amount: number;
  transferContent: string;
  qrUrl: string;
  environment: "sandbox";
};

function CheckoutContent() {
  const router = useRouter();
  const params = useSearchParams();
  const orderCode = params.get("orderCode") ?? "";
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const checkingRef = useRef(false);

  const check = useCallback(async (signal?: AbortSignal) => {
    if (checkingRef.current) return;
    const token = localStorage.getItem("brewlite_access_token");
    if (!orderCode || !token) {
      setError(!orderCode ? "Không tìm thấy mã đơn hàng." : "Bạn cần đăng nhập để xem thanh toán.");
      return;
    }
    checkingRef.current = true;
    setChecking(true);
    try {
      const response = await fetch(`${API_URL}/payments/checkout?orderCode=${encodeURIComponent(orderCode)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Không thể kiểm tra thanh toán.");
      if (signal?.aborted) return;
      if (!["PENDING", "PAYMENT_FAILED"].includes(data.orderStatus)) {
        setInstructions(null);
        router.replace(`/payment/result?orderCode=${encodeURIComponent(orderCode)}`);
        return;
      }
      if (!data.instructions || data.instructions.environment !== "sandbox") throw new Error("Thông tin thanh toán không hợp lệ.");
      setInstructions(data.instructions);
      setError("");
      setNotice("Đang chờ xác nhận thanh toán từ SePay.");
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Không thể kết nối máy chủ.");
    } finally {
      checkingRef.current = false;
      if (!signal?.aborted) setChecking(false);
    }
  }, [orderCode, router]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { if (!document.hidden) void check(controller.signal); };
    // Defer one tick so Strict Mode cleanup cannot suppress the next mount's fetch.
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort(); clearTimeout(initial); clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [check]);

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Đã sao chép."); }
    catch { setNotice("Không thể sao chép tự động. Bạn có thể chọn và sao chép nội dung bên dưới."); }
  }

  return (
    <main className="min-h-screen bg-stone-100 p-4 text-stone-800 sm:py-10">
      <section className="relative mx-auto max-w-lg rounded-3xl bg-white p-6 shadow-lg sm:p-8">
        <Link href="/orders/history" aria-label="Đóng và về lịch sử mua hàng" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </Link>
        <p className="text-sm font-bold text-emerald-800">BrewLite</p>
        <h1 className="mt-2 text-2xl font-bold">Thanh toán chuyển khoản</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          Chế độ thử nghiệm Sandbox. Không chuyển tiền thật. Dùng thông tin bên dưới để mô phỏng giao dịch trong SePay Test mode.
        </p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!instructions && !error && <p className="py-10 text-center">Đang tải thông tin thanh toán…</p>}
        {instructions && <>
          <p className="mt-5 text-center text-3xl font-extrabold text-emerald-900">{new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(instructions.amount)}</p>
          {!qrFailed ? (
            // SePay serves a dynamic QR image; avoid proxying it through Next's image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={instructions.qrUrl} alt="Mã QR thanh toán thử nghiệm" width={256} height={256} referrerPolicy="no-referrer" onError={() => setQrFailed(true)} className="mx-auto my-5 h-64 w-64 max-w-full rounded-xl border border-stone-100 object-contain" />
          ) : <p className="my-5 text-center text-sm text-stone-500">Không tải được QR. Thông tin chuyển khoản vẫn có ở bên dưới.</p>}
          <dl className="space-y-3 rounded-2xl bg-stone-50 p-4 text-sm">
            <div><dt className="text-stone-500">Ngân hàng</dt><dd className="mt-1 font-semibold">{instructions.bankName}</dd></div>
            <div><dt className="text-stone-500">Chủ tài khoản</dt><dd className="mt-1 font-semibold">{instructions.accountName}</dd></div>
            <div><dt className="text-stone-500">Số tài khoản</dt><dd className="mt-1 flex items-center justify-between gap-3"><span className="break-all font-semibold">{instructions.accountNumber}</span><button onClick={() => void copy(instructions.accountNumber)} className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-emerald-800">Sao chép</button></dd></div>
            <div><dt className="text-stone-500">Nội dung chuyển khoản</dt><dd className="mt-1 flex items-center justify-between gap-3"><span className="break-all font-bold text-emerald-900">{instructions.transferContent}</span><button onClick={() => void copy(instructions.transferContent)} className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-emerald-800">Sao chép</button></dd></div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-stone-600">Nhập đúng số tiền và toàn bộ nội dung chuyển khoản. Trang sẽ tự cập nhật khi thanh toán được xác nhận.</p>
        </>}
        <p role="status" className="mt-4 text-center text-sm text-emerald-800">{notice}</p>
        <button onClick={() => void check()} disabled={checking || !orderCode} className="mt-4 w-full rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{checking ? "Đang kiểm tra…" : "Kiểm tra trạng thái"}</button>
        <Link href="/orders/history" className="mt-3 block rounded-xl border border-stone-200 px-4 py-3 text-center font-semibold hover:bg-stone-50">Lịch sử mua hàng</Link>
        <p className="mt-5 break-all text-center text-xs text-stone-400">Đơn hàng: {orderCode}</p>
      </section>
    </main>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<p className="p-8 text-center">Đang tải thanh toán…</p>}><CheckoutContent /></Suspense>;
}
