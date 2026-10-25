
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AuthUser = {
  id: string;
  email: string;
  phone: string;
  loyaltyPoints: number;
};

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem("brewlite_access_token");
      const savedUser = localStorage.getItem("brewlite_user");

      if (token && savedUser) {
        setUser(JSON.parse(savedUser) as AuthUser);
      }
    } catch (error) {
      console.error("Lỗi đọc thông tin tài khoản:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <p className="text-stone-600">Đang tải thông tin...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center text-stone-800">
      <main className="w-full max-w-md min-h-screen bg-[#FCFBF8] shadow-xl">
        <header className="bg-emerald-900 text-white px-5 py-5">
          <Link href="/" className="text-sm text-emerald-100">
            ← Trở về trang chủ
          </Link>
          <h1 className="text-xl font-bold mt-4">
            Thông tin tài khoản
          </h1>
          <p className="text-xs text-emerald-100 mt-1">
            BrewLite • Quản lý tài khoản cá nhân
          </p>
        </header>

        {!user ? (
          <div className="p-6 text-center">
            <p className="text-stone-600 text-sm">
              Bạn cần đăng nhập để xem thông tin tài khoản.
            </p>
            <Link
              href="/"
              className="inline-block mt-5 bg-emerald-800 text-white px-5 py-3 rounded-xl text-sm font-semibold"
            >
              Về trang chủ để đăng nhập
            </Link>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex flex-col items-center py-5">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center text-4xl">
                👤
              </div>
              <h2 className="font-bold text-lg mt-3">
                Tài khoản BrewLite
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Thông tin người dùng
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 shadow-sm">
              <h3 className="font-bold text-emerald-950">
                Thông tin cá nhân
              </h3>

              <div>
                <p className="text-xs text-stone-500">Email</p>
                <p className="font-semibold mt-1 break-all">
                  {user.email || "Chưa cập nhật"}
                </p>
              </div>

              <div className="border-t border-stone-100 pt-3">
                <p className="text-xs text-stone-500">
                  Số điện thoại
                </p>
                <p className="font-semibold mt-1">
                  {user.phone || "Chưa cập nhật"}
                </p>
              </div>

              <div className="border-t border-stone-100 pt-3">
                <p className="text-xs text-stone-500">
                  Mã người dùng
                </p>
                <p className="text-xs font-medium mt-1 break-all">
                  {user.id}
                </p>
              </div>
            </div>

            <div className="bg-emerald-900 rounded-2xl p-5 text-white">
              <p className="text-sm text-emerald-100">
                Điểm tích lũy
              </p>
              <p className="text-3xl font-bold mt-2">
                {user.loyaltyPoints ?? 0}
              </p>
              <p className="text-xs text-emerald-100 mt-2">
                Điểm được lưu trong thông tin đăng nhập.
              </p>
            </div>

            <Link
              href="/orders/history"
              className="block w-full text-center bg-white border border-emerald-800 text-emerald-900 rounded-xl py-3 font-semibold text-sm"
            >
              Xem lịch sử đặt hàng →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
