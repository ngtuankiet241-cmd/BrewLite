"use client";

import { useEffect, useRef, useState } from "react";

interface CancelOrderDialogProps {
  orderCode: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function CancelOrderDialog({ orderCode, onClose, onConfirm }: CancelOrderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");

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
        <p>Đơn sẽ bị hủy. Nguyên liệu có thể được hoàn về kho hoặc cần kiểm tra thủ công. Lượt mã giảm giá và điểm đã dùng sẽ được hoàn lại; điểm tích lũy từ đơn này sẽ được thu hồi.</p>
        <p>Nếu đã thanh toán qua SePay Sandbox, hệ thống sẽ giả lập hoàn đúng số tiền đã trả. Không chuyển tiền thật.</p>
      </div>
      <label htmlFor="cancel-order-reason" className="mt-4 block text-sm font-semibold">Lý do hủy</label>
      <textarea id="cancel-order-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required rows={3} placeholder="Ví dụ: Khách yêu cầu hủy trước khi pha chế" className="mt-2 w-full rounded-xl border border-stone-300 p-3 text-sm focus:outline-emerald-800" />
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" autoFocus onClick={onClose} className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Giữ đơn</button>
        <button type="button" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())} className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-not-allowed disabled:opacity-50">Xác nhận hủy đơn</button>
      </div>
    </dialog>
  );
}
