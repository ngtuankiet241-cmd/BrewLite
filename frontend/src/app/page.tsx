"use client";

import React, { useState, useEffect } from "react";

// ============================================================================
// 1. ĐỊNH NGHĨA KIỂU DỮ LIỆU (TYPES & INTERFACES)
// ============================================================================

/**
 * Interface đại diện cho thông tin một sản phẩm đồ uống trong menu BrewLite
 */
export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  stock: number;
  description?: string;
  category?: string;
}

// ============================================================================
// 2. DỮ LIỆU MẪU (MOCK DATA)
// ============================================================================

/**
 * Mảng dữ liệu mẫu gồm 4 món đặc trưng theo yêu cầu đề bài
 * Link ảnh Unsplash được tuyển chọn kỹ lưỡng, chất lượng cao về cà phê và trà
 */
export const MOCK_PRODUCTS: Product[] = [
  {
    id: "brew-01",
    name: "Cà phê sữa",
    price: 35000,
    imageUrl:
      "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80",
    stock: 25,
    description: "Cà phê Robusta đậm vị hòa quyện sữa đặc béo ngậy truyền thống",
    category: "Cà phê",
  },
  {
    id: "brew-02",
    name: "Americano",
    price: 40000,
    imageUrl:
      "https://images.unsplash.com/photo-1551030173-122aabc4489c?auto=format&fit=crop&w=600&q=80",
    stock: 18,
    description: "Espresso pha loãng với nước tinh khiết, thanh nhẹ và sảng khoái",
    category: "Cà phê",
  },
  {
    id: "brew-03",
    name: "Cappuccino",
    price: 45000,
    imageUrl:
      "https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80",
    stock: 12,
    description: "Sự cân bằng tinh tế giữa espresso, sữa nóng và bọt sữa mịn màng",
    category: "Cà phê",
  },
  {
    id: "brew-04",
    name: "Trà đào",
    price: 39000,
    imageUrl:
      "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=80",
    stock: 20,
    description: "Trà ủ lạnh thơm nồng kết hợp miếng đào giòn ngọt mát lạnh",
    category: "Trà trái cây",
  },
];

// ============================================================================
// 3. HÀM TIỆN ÍCH (HELPERS)
// ============================================================================

/**
 * Định dạng tiền tệ theo chuẩn Việt Nam Đồng (VND)
 * Ví dụ: 35000 -> 35.000 ₫
 */
const formatPriceVND = (price: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);
};

// ============================================================================
// 4. MAIN COMPONENT: MENU PAGE
// ============================================================================

export default function MenuPage() {
  // Quản lý danh sách sản phẩm hiện tại
  const [products, setProducts] = useState<Product[]>([]);
  // Trạng thái đang tải (Loading state cho DoD)
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Số lượng sản phẩm trong giỏ hàng (hiển thị ở bottom bar)
  const [cartCount] = useState<number>(0);

  /**
   * Giả lập hiệu ứng tải dữ liệu từ API khi vào trang (600ms)
   * Nhằm minh họa Skeleton Loading theo tiêu chí nghiệm thu DoD
   */
  useEffect(() => {
    loadMockData();
  }, []);

  const loadMockData = () => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setProducts(MOCK_PRODUCTS);
      setIsLoading(false);
    }, 700);

    return () => clearTimeout(timer);
  };

  /**
   * Xử lý khi người dùng nhấn vào thẻ sản phẩm
   * Yêu cầu: Tạm thời hiển thị alert tên món (chưa mở modal chi tiết)
   */
  const handleProductClick = (product: Product) => {
    alert(`Bạn đã chọn: ${product.name} (${formatPriceVND(product.price)})`);
  };

  /**
   * Xử lý khi nhấn nút Xem giỏ hàng
   */
  const handleViewCart = () => {
    alert("Giỏ hàng hiện tại đang trống (0 món).");
  };

  return (
    // Bố cục tổng thể: Nền xám/ấm sáng sủa, căn giữa màn hình chuẩn Mobile-First (max-w-md)
    <div className="min-h-screen bg-stone-100 flex justify-center text-stone-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
      <main className="w-full max-w-md min-h-screen bg-[#FCFBF8] shadow-xl flex flex-col relative pb-28">
        {/* ------------------------------------------------------------------ */}
        {/* HEADER: Tên quán, Subtitle và Icon Menu                             */}
        {/* ------------------------------------------------------------------ */}
        <header className="sticky top-0 z-20 bg-[#FCFBF8]/90 backdrop-blur-md border-b border-stone-200/70 px-4 py-3.5 transition-all">
          <div className="flex items-center justify-between">
            {/* Nhánh bên trái: Tên thương hiệu & Subtitle */}
            <div>
              <div className="flex items-center gap-1.5">
                {/* Chấm tròn nhận diện thương hiệu tone xanh rêu */}
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block animate-pulse" />
                <h1 className="text-xl font-extrabold tracking-tight text-emerald-950 font-serif">
                  BrewLite
                </h1>
              </div>
              <p className="text-[11px] font-medium tracking-wide uppercase text-amber-900/75 mt-0.5">
                Cashless Drink Ordering
              </p>
            </div>

            {/* Nhánh bên phải: Nút Menu Icon nhỏ gọn */}
            <button
              type="button"
              aria-label="Mở danh mục menu"
              onClick={() => alert("Menu tùy chọn đang được phát triển")}
              className="p-2 rounded-xl text-stone-600 hover:text-emerald-900 hover:bg-stone-200/60 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            >
              {/* Icon 3 gạch ngang (Hamburger Menu) */}
              <svg
                className="w-5 h-5 stroke-current"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="14" y2="17" />
              </svg>
            </button>
          </div>

          {/* Thanh công cụ hỗ trợ kiểm thử nghiệm thu (DoD Tester Toolbar) */}
          <div className="mt-3 pt-2 border-t border-stone-200/50 flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-stone-600 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-700" />
              Thực đơn hôm nay
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={loadMockData}
                className="px-2 py-0.5 rounded-md bg-stone-200/80 hover:bg-stone-300 text-stone-700 text-[10px] font-medium transition-colors"
                title="Giả lập hiệu ứng Skeleton khi tải lại"
              >
                Test Loading
              </button>
              <button
                type="button"
                onClick={() => setProducts([])}
                className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-medium transition-colors"
                title="Giả lập danh sách rỗng để nghiệm thu Empty state"
              >
                Test Empty
              </button>
            </div>
          </div>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* NỘI DUNG CHÍNH: LƯỚI SẢN PHẨM HOẶC TRẠNG THÁI SKELETON / EMPTY       */}
        {/* ------------------------------------------------------------------ */}
        <section className="flex-1 px-3.5 pt-4">
          {/* TRƯỜNG HỢP 1: LOADING STATE (Hiệu ứng Skeleton nhấp nháy animate-pulse) */}
          {isLoading && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="h-4 w-28 bg-stone-200 rounded-md animate-pulse" />
                <div className="h-3 w-16 bg-stone-200 rounded-md animate-pulse" />
              </div>

              {/* Lưới Skeleton 2 cột */}
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="bg-white rounded-2xl p-2.5 shadow-sm border border-stone-200/60 flex flex-col animate-pulse"
                  >
                    {/* Skeleton khung ảnh */}
                    <div className="w-full aspect-square bg-stone-200 rounded-xl mb-2.5" />
                    {/* Skeleton tên món */}
                    <div className="h-4 bg-stone-200 rounded w-4/5 mb-1.5" />
                    {/* Skeleton giá tiền */}
                    <div className="h-3.5 bg-stone-200 rounded w-2/5 mt-auto" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TRƯỜNG HỢP 2: EMPTY STATE (Khi danh sách sản phẩm rỗng) */}
          {!isLoading && products.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center mb-3 shadow-inner">
                {/* Icon tách cà phê rỗng */}
                <svg
                  className="w-8 h-8 stroke-current"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-stone-800">
                Chưa có món nào hôm nay
              </h2>
              <p className="text-xs text-stone-500 mt-1 max-w-[220px]">
                Danh sách thức uống hiện đang trống hoặc đang cập nhật công thức mới.
              </p>
              <button
                type="button"
                onClick={loadMockData}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
              >
                Tải lại thực đơn mẫu
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 3: DANH SÁCH SẢN PHẨM (Bố cục 2 cột: grid grid-cols-2 gap-3) */}
          {!isLoading && products.length > 0 && (
            <div>
              {/* Tiêu đề nhóm thực đơn */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                  Món nổi bật ({products.length})
                </span>
                <span className="text-[11px] text-stone-600">
                  Chạm để chọn món
                </span>
              </div>

              {/* Lưới sản phẩm */}
              <div className="grid grid-cols-2 gap-3">
                {products.map((product) => (
                  <article
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className="group bg-white rounded-2xl p-2.5 shadow-sm border border-stone-200/70 hover:border-emerald-300 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col active:scale-[0.98] select-none"
                  >
                    {/* Khung ảnh món ăn bo góc rounded-2xl */}
                    <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-stone-100 mb-2.5">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {/* Tag số lượng có sẵn nhẹ nhàng */}
                      <span className="absolute top-2 right-2 bg-stone-900/65 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded-full shadow-xs">
                        Còn {product.stock}
                      </span>
                    </div>

                    {/* Tên món và giá tiền */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-stone-900 line-clamp-1 group-hover:text-emerald-900 transition-colors">
                          {product.name}
                        </h2>
                        {product.description && (
                          <p className="text-[11px] text-stone-600 line-clamp-1 mt-0.5 leading-tight">
                            {product.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-2.5 pt-1.5 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900">
                          {formatPriceVND(product.price)}
                        </span>
                        {/* Nút cộng nhỏ trang trí */}
                        <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center text-xs font-bold group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                          +
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* BOTTOM BAR CỐ ĐỊNH: Chứa nút 'Xem giỏ hàng (0)'                     */}
        {/* ------------------------------------------------------------------ */}
        <footer className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto pointer-events-none">
          <div className="p-3 bg-gradient-to-t from-[#FCFBF8] via-[#FCFBF8]/95 to-transparent pointer-events-auto">
            <button
              type="button"
              onClick={handleViewCart}
              className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-semibold py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-900/20 active:scale-[0.99] transition-all flex items-center justify-between"
            >
              {/* Biểu tượng Giỏ hàng */}
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <svg
                    className="w-5 h-5 stroke-current"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                  {/* Badge số lượng sản phẩm trên giỏ */}
                  <span className="absolute -top-1.5 -right-2 bg-amber-500 text-stone-950 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                </div>
                <span className="text-sm tracking-wide">
                  Xem giỏ hàng ({cartCount})
                </span>
              </div>

              {/* Thông tin phụ bên phải nút */}
              <div className="flex items-center gap-1.5 text-xs text-emerald-100 font-medium">
                <span>0 ₫</span>
                <svg
                  className="w-4 h-4 stroke-current"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
