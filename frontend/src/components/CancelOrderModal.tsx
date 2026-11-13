"use client";

import { useEffect, useRef } from "react";

type CancelOrderModalProps = {
  orderCode: string;
  hasPayment: boolean;
  isCancelling: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function CancelOrderModal({
  orderCode,
  hasPayment,
  isCancelling,
  error,
  onClose,
  onConfirm,
}: CancelOrderModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cancel-order-title"
      aria-describedby="cancel-order-description"
      aria-busy={isCancelling}
      onCancel={(event) => {
        event.preventDefault();
        if (!isCancelling) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-stone-200 bg-[#FCFBF8] p-6 text-stone-800 shadow-2xl backdrop:bg-stone-950/60 backdrop:backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        disabled={isCancelling}
        aria-label="Đóng xác nhận hủy đơn"
        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>

      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-700">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6m0 4h.01" />
        </svg>
      </div>
      <h2 id="cancel-order-title" className="text-center text-xl font-bold text-stone-900">
        Xác nhận hủy đơn hàng?
      </h2>
      <div className="mt-4 rounded-xl bg-stone-100 p-3 text-center">
        <p className="text-xs text-stone-500">Mã đơn hàng</p>
        <p className="mt-1 break-all text-sm font-semibold">{orderCode}</p>
      </div>
      <p id="cancel-order-description" className="mt-4 text-center text-sm leading-6 text-stone-600">
        Điểm đã dùng sẽ được hoàn và điểm thưởng của đơn sẽ được thu hồi.
        {hasPayment && " Khoản đã thanh toán sẽ được gửi yêu cầu hoàn tiền."}
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          disabled={isCancelling}
          className="flex-1 rounded-xl border border-emerald-800 px-4 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-50"
        >
          Giữ đơn hàng
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isCancelling}
          className="flex-1 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-50"
        >
          {isCancelling ? "Đang hủy đơn…" : "Xác nhận hủy"}
        </button>
      </div>
      <p role="status" className="sr-only">{isCancelling ? "Đang xử lý yêu cầu hủy đơn hàng." : ""}</p>
    </dialog>
  );
}
