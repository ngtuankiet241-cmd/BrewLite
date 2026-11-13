"use client";

import { useEffect, useRef } from "react";

export default function RefundRetryDialog({ orderCode, amount, onClose, onConfirm }: {
  orderCode: string;
  amount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby="retry-refund-title" aria-describedby="retry-refund-description" onCancel={(event) => { event.preventDefault(); onClose(); }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-6 text-stone-800 shadow-xl backdrop:bg-stone-950/50">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Xác nhận thao tác</p>
      <h2 id="retry-refund-title" className="mt-3 text-xl font-bold">Gửi lại yêu cầu hoàn tiền?</h2>
      <div id="retry-refund-description" className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
        <p>Mã đơn: <strong className="break-all text-stone-900">{orderCode}</strong></p>
        <p>Số tiền: <strong>{new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount)}</strong></p>
        <p>Hệ thống sẽ tiếp tục xử lý yêu cầu hoàn tiền hiện có. Thao tác này chưa xác nhận tiền đã được hoàn cho khách.</p>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" autoFocus onClick={onClose} className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold hover:bg-stone-50">Quay lại</button>
        <button type="button" onClick={onConfirm} className="rounded-xl bg-amber-700 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-800">Xác nhận gửi lại</button>
      </div>
    </dialog>
  );
}
