"use client";

import { useEffect, useRef } from "react";

interface CancelOrderDialogProps {
  orderCode: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CancelOrderDialog({ orderCode, onClose, onConfirm }: CancelOrderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cancel-order-title"
      aria-describedby="cancel-order-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-6 text-stone-800 shadow-xl backdrop:bg-stone-950/50"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-rose-700">Xác nhận thao tác</p>
      <h2 id="cancel-order-title" className="mt-3 text-xl font-bold">Hủy đơn hàng?</h2>
      <div id="cancel-order-description" className="mt-3 space-y-3 text-sm leading-6 text-stone-600">
        <p>Mã đơn: <strong className="break-all text-stone-900">{orderCode}</strong></p>
        <p>Đơn sẽ chuyển sang trạng thái đã hủy. Thao tác này không xác nhận rằng tiền thanh toán đã được hoàn cho khách.</p>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" autoFocus onClick={onClose} className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Giữ đơn</button>
        <button type="button" onClick={onConfirm} className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">Xác nhận hủy đơn</button>
      </div>
    </dialog>
  );
}
