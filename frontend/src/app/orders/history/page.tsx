
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type OrderOption = {
  id: string;
  name: string;
  extraPrice: number;
};

type OrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  size: OrderOption;
  toppings: OrderOption[];
  unitPrice: number;
  lineTotal: number;
};

type Order = {
  orderCode: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    async function loadOrders() {
      const token = localStorage.getItem("brewlite_access_token");

      if (!token) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }

      setIsLoggedIn(true);

      try {
        const response = await fetch(`${API_URL}/orders/history`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            );
          }

          throw new Error("Không thể tải lịch sử đặt hàng.");
        }

        const data: Order[] = await response.json();
        setOrders(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Có lỗi xảy ra."
        );
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  return (
    <main className="min-h-screen bg-stone-100 text-stone-800">
      <div className="max-w-2xl mx-auto min-h-screen bg-[#FCFBF8] shadow-sm">
        <header className="bg-emerald-900 text-white p-5">
          <Link href="/" className="text-sm text-emerald-100">
            ← Trở về trang chủ
          </Link>

          <h1 className="text-2xl font-bold mt-4">
            Lịch sử đặt hàng
          </h1>

          <p className="text-sm text-emerald-100 mt-1">
            Theo dõi các đơn hàng của bạn tại BrewLite
          </p>
        </header>

        <div className="p-5 space-y-4">
          {loading && (
            <p className="text-center py-10">
              Đang tải lịch sử đặt hàng...
            </p>
          )}

          {!loading && !isLoggedIn && (
            <div className="bg-white rounded-2xl p-6 text-center">
              <p>Bạn cần đăng nhập để xem lịch sử đặt hàng.</p>
              <Link
                href="/"
                className="inline-block mt-4 px-5 py-3 rounded-xl bg-emerald-800 text-white"
              >
                Về trang chủ để đăng nhập
              </Link>
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl">
              {error}
            </div>
          )}

          {!loading &&
            isLoggedIn &&
            !error &&
            orders.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center">
                <p className="text-4xl mb-3">🧾</p>
                <h2 className="font-bold">Chưa có đơn hàng</h2>
                <p className="text-sm text-stone-500 mt-2">
                  Các đơn hàng của bạn sẽ xuất hiện tại đây.
                </p>
                <Link
                  href="/"
                  className="inline-block mt-5 bg-emerald-800 text-white px-5 py-3 rounded-xl"
                >
                  Đặt món ngay
                </Link>
              </div>
            )}

          {!loading &&
            !error &&
            orders.map((order) => {
              const expanded = selectedOrder === order.orderCode;

              return (
                <div
                  key={order.orderCode}
                  className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex justify-between gap-3 items-start">
                    <div className="min-w-0">
                      <p className="text-xs text-stone-500">
                        Mã đơn hàng
                      </p>
                      <p className="font-bold text-sm break-all">
                        {order.orderCode}
                      </p>
                    </div>

                    <span className="text-xs font-semibold px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full shrink-0">
                      {order.status === "PENDING"
                        ? "Chờ xử lý"
                        : order.status === "PAID"
                        ? "Đã thanh toán"
                        : order.status}
                    </span>
                  </div>

                  <p className="text-xs text-stone-500 mt-3">
                    {new Date(order.createdAt).toLocaleString("vi-VN")}
                  </p>

                  <div className="border-t border-stone-100 mt-4 pt-4 flex justify-between items-center">
                    <span className="font-semibold">Tổng tiền</span>
                    <span className="font-bold text-emerald-900">
                      {formatMoney(order.totalAmount)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedOrder(
                        expanded ? null : order.orderCode
                      )
                    }
                    className="w-full mt-4 py-3 border border-emerald-800 text-emerald-900 rounded-xl font-semibold text-sm hover:bg-emerald-50"
                  >
                    {expanded
                      ? "Thu gọn chi tiết"
                      : "Xem chi tiết hóa đơn"}
                  </button>

                  {expanded && (
                    <div className="mt-4 border-t border-stone-200 pt-4 space-y-4">
                      <h3 className="font-bold text-sm">
                        Chi tiết đơn hàng
                      </h3>

                      {order.items.map((item, index) => (
                        <div
                          key={`${item.productId}-${index}`}
                          className="border-b border-stone-100 pb-3"
                        >
                          <div className="flex justify-between gap-3">
                            <p className="font-semibold text-sm">
                              {item.quantity} × {item.productName}
                            </p>
                            <p className="font-semibold text-sm shrink-0">
                              {formatMoney(item.lineTotal)}
                            </p>
                          </div>

                          <p className="text-xs text-stone-500 mt-1">
                            Size: {item.size.name}
                          </p>

                          {item.toppings.length > 0 && (
                            <p className="text-xs text-stone-500 mt-1">
                              Topping:{" "}
                              {item.toppings
                                .map((topping) => topping.name)
                                .join(", ")}
                            </p>
                          )}

                          <p className="text-xs text-stone-500 mt-1">
                            Đơn giá: {formatMoney(item.unitPrice)}
                          </p>
                        </div>
                      ))}

                      <div className="flex justify-between font-bold text-emerald-900">
                        <span>Thành tiền</span>
                        <span>
                          {formatMoney(order.totalAmount)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </main>
  );
}
