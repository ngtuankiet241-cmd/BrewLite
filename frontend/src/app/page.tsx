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

/**
 * Interface cho tùy chọn kích cỡ (Size)
 */
export interface SizeOption {
  id: string;
  name: string;
  extraPrice: number;
}

/**
 * Interface cho tùy chọn Topping
 */
export interface ToppingOption {
  id: string;
  name: string;
  extraPrice: number;
}

/**
 * Interface lưu thông tin tóm tắt món vừa thêm vào giỏ hàng
 * Dùng để hiển thị Popup Modal thông báo thành công xịn sò
 */
export interface AddedCartItemSummary {
  productName: string;
  sizeName: string;
  sizeExtraPrice: number;
  toppings: string[];
  totalPrice: number;
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

/**
 * Danh sách tùy chọn kích cỡ (Size):
 * Size S (+0₫), Size M (+5.000₫), Size L (+10.000₫)
 */
export const SIZE_OPTIONS: SizeOption[] = [
  { id: "S", name: "Size S", extraPrice: 0 },
  { id: "M", name: "Size M", extraPrice: 5000 },
  { id: "L", name: "Size L", extraPrice: 10000 },
];

/**
 * Danh sách tùy chọn Topping đa chọn (Checkbox):
 * Trân châu (+10.000₫), Kem Cheese (+10.000₫)
 */
export const TOPPING_OPTIONS: ToppingOption[] = [
  { id: "boba", name: "Trân châu", extraPrice: 10000 },
  { id: "cheese", name: "Kem Cheese", extraPrice: 10000 },
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

  // Quản lý giỏ hàng: số lượng món và tổng số tiền tích lũy
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartTotal, setCartTotal] = useState<number>(0);

  // --------------------------------------------------------------------------
  // STATE CHO TASK 4: MODAL CHI TIẾT & TÙY CHỌN MÓN
  // --------------------------------------------------------------------------
  // Sản phẩm đang được chọn mở modal tùy chọn (null nếu modal đóng)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  // Kích cỡ được chọn (mặc định là Size S)
  const [selectedSize, setSelectedSize] = useState<SizeOption>(SIZE_OPTIONS[0]);
  // Danh sách ID của các topping đã tick chọn (checkbox đa chọn)
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);

  // --------------------------------------------------------------------------
  // STATE CHO MODAL THÔNG BÁO THÀNH CÔNG (SUCCESS DIALOG POPUP)
  // --------------------------------------------------------------------------
  const [addedItemSummary, setAddedItemSummary] =
    useState<AddedCartItemSummary | null>(null);

  /**
   * Giả lập hiệu ứng tải dữ liệu từ API khi vào trang (700ms)
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
   * Mở Modal Chi tiết & tùy chọn khi click vào món
   * Khởi tạo lại các tùy chọn mặc định (Size S, chưa chọn topping nào)
   */
  const handleOpenDetailModal = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(SIZE_OPTIONS[0]);
    setSelectedToppings([]);
  };

  /**
   * Đóng Modal Chi tiết món
   */
  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  /**
   * Xử lý tick / bỏ tick Topping (đa chọn)
   */
  const handleToggleTopping = (toppingId: string) => {
    setSelectedToppings((prev) =>
      prev.includes(toppingId)
        ? prev.filter((id) => id !== toppingId)
        : [...prev, toppingId]
    );
  };

  /**
   * TÍNH TOÁN ĐƠN GIÁ ĐỘNG (Dynamic Price Calculation):
   * Công thức: Giá gốc + Giá size + Giá các topping đã tick
   */
  const calculateTotalPrice = (): number => {
    if (!selectedProduct) return 0;
    const basePrice = selectedProduct.price;
    const sizePrice = selectedSize.extraPrice;
    const toppingsPrice = selectedToppings.reduce((total, id) => {
      const found = TOPPING_OPTIONS.find((t) => t.id === id);
      return total + (found ? found.extraPrice : 0);
    }, 0);

    return basePrice + sizePrice + toppingsPrice;
  };

  /**
   * Xử lý khi nhấn nút "Thêm vào giỏ" trong Modal:
   * Thay thế alert() thô sơ bằng việc mở Modal Popup Thông Báo Thành Công xịn sò
   */
  const handleAddToCart = () => {
    if (!selectedProduct) return;

    const totalPrice = calculateTotalPrice();
    const toppingNames = selectedToppings
      .map((id) => TOPPING_OPTIONS.find((t) => t.id === id)?.name)
      .filter((name): name is string => Boolean(name));

    // 1. Lưu thông tin tóm tắt món vừa thêm vào state
    setAddedItemSummary({
      productName: selectedProduct.name,
      sizeName: selectedSize.name,
      sizeExtraPrice: selectedSize.extraPrice,
      toppings: toppingNames,
      totalPrice: totalPrice,
    });

    // 2. Cập nhật số lượng và tổng tiền giỏ hàng ở Bottom bar
    setCartCount((prev) => prev + 1);
    setCartTotal((prev) => prev + totalPrice);

    // 3. Đóng Bottom Sheet chi tiết món
    handleCloseModal();
  };

  /**
   * Đóng Modal thông báo thành công để tiếp tục chọn món
   */
  const handleCloseSuccessModal = () => {
    setAddedItemSummary(null);
  };

  /**
   * Xử lý khi nhấn nút Xem giỏ hàng ở Bottom bar
   */
  const handleViewCart = () => {
    if (cartCount === 0) {
      alert("Giỏ hàng của bạn hiện đang trống (0 món).");
    } else {
      alert(
        `Giỏ hàng của bạn:\n• Số lượng: ${cartCount} món\n• Tổng số tiền: ${formatPriceVND(cartTotal)}`
      );
    }
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
                  Chạm để tùy chọn món
                </span>
              </div>

              {/* Lưới sản phẩm 2 cột */}
              <div className="grid grid-cols-2 gap-3">
                {products.map((product) => (
                  <article
                    key={product.id}
                    onClick={() => handleOpenDetailModal(product)}
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
        {/* BOTTOM BAR CỐ ĐỊNH: Chứa nút 'Xem giỏ hàng' với số lượng & tổng tiền */}
        {/* ------------------------------------------------------------------ */}
        <footer className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto pointer-events-none">
          <div className="p-3 bg-gradient-to-t from-[#FCFBF8] via-[#FCFBF8]/95 to-transparent pointer-events-auto">
            <button
              type="button"
              onClick={handleViewCart}
              className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-semibold py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-900/20 active:scale-[0.99] transition-all flex items-center justify-between"
            >
              {/* Biểu tượng Giỏ hàng và số lượng */}
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

              {/* Tổng số tiền món đã thêm */}
              <div className="flex items-center gap-1.5 text-xs text-emerald-100 font-bold">
                <span>{cartTotal > 0 ? formatPriceVND(cartTotal) : "0 ₫"}</span>
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

        {/* ------------------------------------------------------------------ */}
        {/* TASK 4: MODAL / BOTTOM SHEET CHI TIẾT VÀ TÙY CHỌN MÓN              */}
        {/* ------------------------------------------------------------------ */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            {/* Lớp nền làm mờ (Backdrop Blur) */}
            <div
              onClick={handleCloseModal}
              className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity duration-300"
            />

            {/* Khung Bottom Sheet trượt từ dưới lên */}
            <div className="relative z-10 w-full max-w-md bg-[#FCFBF8] rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-300">
              {/* Thanh gạt nhỏ trên cùng phong cách Bottom Sheet */}
              <div className="pt-2 pb-1 flex justify-center sm:hidden">
                <span className="w-12 h-1 bg-stone-300 rounded-full" />
              </div>

              {/* Nút Đóng '✕ Đóng' góc trên bên phải */}
              <button
                type="button"
                onClick={handleCloseModal}
                className="absolute top-3 right-3 z-20 flex items-center gap-1 px-3 py-1.5 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white text-xs font-medium backdrop-blur-md shadow-md active:scale-95 transition-all"
                aria-label="Đóng cửa sổ tùy chọn"
              >
                <span>✕</span>
                <span>Đóng</span>
              </button>

              {/* VÙNG CUỘN NỘI DUNG TÙY CHỌN */}
              <div className="flex-1 overflow-y-auto px-4 pb-6 pt-1">
                {/* 1. ẢNH LỚN SẢN PHẨM */}
                <div className="relative w-full h-56 rounded-2xl overflow-hidden shadow-sm bg-stone-100 mb-3.5">
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                  {selectedProduct.category && (
                    <span className="absolute bottom-3 left-3 bg-emerald-900/85 backdrop-blur-xs text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-xs">
                      {selectedProduct.category}
                    </span>
                  )}
                </div>

                {/* 2. TÊN MÓN VÀ GIÁ CƠ SỞ */}
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-xl font-bold text-stone-900 font-serif">
                      {selectedProduct.name}
                    </h2>
                    <span className="text-base font-extrabold text-emerald-900 whitespace-nowrap">
                      {formatPriceVND(selectedProduct.price)}
                    </span>
                  </div>
                  {selectedProduct.description && (
                    <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                      {selectedProduct.description}
                    </p>
                  )}
                </div>

                {/* 3. TÙY CHỌN KÍCH CỠ (SIZE) - 3 NÚT BẤM DẠNG PILL */}
                <div className="mb-5 bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                      <span>Kích cỡ (Size)</span>
                      <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-normal lowercase">
                        bắt buộc
                      </span>
                    </label>
                    <span className="text-[11px] text-stone-500">
                      Chọn 1 loại
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {SIZE_OPTIONS.map((size) => {
                      const isSelected = selectedSize.id === size.id;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`py-2 px-1 rounded-xl text-center border transition-all duration-200 flex flex-col items-center justify-center ${
                            isSelected
                              ? "bg-emerald-800 border-emerald-800 text-white shadow-sm ring-2 ring-emerald-700/20"
                              : "bg-stone-50/70 border-stone-200 hover:border-emerald-300 text-stone-700 hover:bg-stone-100/70"
                          }`}
                        >
                          <span
                            className={`text-xs font-bold ${
                              isSelected ? "text-white" : "text-stone-800"
                            }`}
                          >
                            {size.name}
                          </span>
                          <span
                            className={`text-[10px] mt-0.5 ${
                              isSelected ? "text-emerald-100" : "text-stone-500"
                            }`}
                          >
                            +{formatPriceVND(size.extraPrice)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. TÙY CHỌN TOPPING (CHECKBOX ĐA CHỌN) */}
                <div className="mb-2 bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                      <span>Topping thêm</span>
                      <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded font-normal lowercase">
                        tùy chọn
                      </span>
                    </label>
                    <span className="text-[11px] text-stone-500">
                      Đa chọn
                    </span>
                  </div>

                  <div className="space-y-2">
                    {TOPPING_OPTIONS.map((topping) => {
                      const isChecked = selectedToppings.includes(topping.id);
                      return (
                        <label
                          key={topping.id}
                          onClick={() => handleToggleTopping(topping.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer select-none transition-all duration-200 ${
                            isChecked
                              ? "bg-emerald-50/60 border-emerald-400 text-emerald-950"
                              : "bg-stone-50/70 border-stone-200 hover:border-stone-300 text-stone-700"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {/* Ô checkbox cách điệu */}
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                isChecked
                                  ? "bg-emerald-800 border-emerald-800 text-white"
                                  : "border-stone-300 bg-white"
                              }`}
                            >
                              {isChecked && (
                                <svg
                                  className="w-3.5 h-3.5 stroke-current"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <span className="text-xs font-semibold">
                              {topping.name}
                            </span>
                          </div>

                          <span
                            className={`text-xs font-bold ${
                              isChecked
                                ? "text-emerald-900"
                                : "text-amber-900/80"
                            }`}
                          >
                            +{formatPriceVND(topping.extraPrice)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* FOOTER CỐ ĐỊNH TRONG MODAL: NÚT THÊM VÀO GIỎ VỚI ĐƠN GIÁ ĐỘNG */}
              <div className="p-3.5 border-t border-stone-200/80 bg-white/95 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-bold py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-950/20 active:scale-[0.99] transition-all flex items-center justify-between"
                >
                  <span className="text-sm">Thêm vào giỏ</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tracking-wide text-emerald-100 font-extrabold">
                      {formatPriceVND(calculateTotalPrice())}
                    </span>
                    <svg
                      className="w-4 h-4 stroke-current"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL / DIALOG POPUP THÔNG BÁO THÀNH CÔNG (CĂN GIỮA MÀN HÌNH)      */}
        {/* ------------------------------------------------------------------ */}
        {addedItemSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Lớp nền làm mờ (Backdrop Blur) */}
            <div
              onClick={handleCloseSuccessModal}
              className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity duration-300"
            />

            {/* Khung Popup màu trắng bo góc tròn đẹp rounded-3xl, shadow-2xl */}
            <div className="relative z-10 w-full max-w-sm bg-[#FCFBF8] rounded-3xl shadow-2xl border border-stone-200/80 p-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
              {/* Biểu tượng dấu tích xanh rêu bo tròn trên cùng */}
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mb-3 shadow-inner">
                <svg
                  className="w-8 h-8 stroke-current"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              {/* Tiêu đề thông báo thành công */}
              <h3 className="text-lg font-extrabold text-stone-900 font-serif text-center">
                Thêm vào giỏ thành công!
              </h3>
              <p className="text-xs text-stone-500 mt-0.5 text-center">
                Món của bạn đã được cập nhật vào giỏ hàng
              </p>

              {/* Bảng tóm tắt đơn hàng (Summary Card) */}
              <div className="w-full bg-stone-50 rounded-2xl p-4 border border-stone-200/70 mt-4 mb-5 space-y-2.5 text-xs text-stone-700">
                {/* Dòng 1: Món */}
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Món:</span>
                  <span className="font-bold text-stone-900 text-sm">
                    {addedItemSummary.productName}
                  </span>
                </div>

                {/* Dòng 2: Kích cỡ */}
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Kích cỡ:</span>
                  <span className="font-semibold text-stone-800">
                    {addedItemSummary.sizeName}
                    {addedItemSummary.sizeExtraPrice > 0 && (
                      <span className="text-stone-500 font-normal ml-1">
                        (+{formatPriceVND(addedItemSummary.sizeExtraPrice)})
                      </span>
                    )}
                  </span>
                </div>

                {/* Dòng 3: Topping */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-stone-500 whitespace-nowrap">Topping:</span>
                  <span className="font-semibold text-stone-800 text-right">
                    {addedItemSummary.toppings.length > 0
                      ? addedItemSummary.toppings.join(", ")
                      : "Không có"}
                  </span>
                </div>

                {/* Đường phân cách */}
                <div className="pt-2 border-t border-stone-200/80 flex items-center justify-between">
                  <span className="font-bold text-stone-800">Tổng tiền:</span>
                  <span className="text-base font-extrabold text-emerald-900">
                    {formatPriceVND(addedItemSummary.totalPrice)}
                  </span>
                </div>
              </div>

              {/* Nút bấm 'Tiếp tục chọn món' màu xanh rêu */}
              <button
                type="button"
                onClick={handleCloseSuccessModal}
                className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-emerald-950/20 active:scale-[0.99] transition-all text-sm"
              >
                Tiếp tục chọn món
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
