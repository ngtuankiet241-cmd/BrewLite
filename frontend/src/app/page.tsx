"use client";

import React, { useState, useEffect, useCallback } from "react";
import CartDrawer from "../components/CartDrawer";
import { useCart } from "../context/CartContext";
import AuthModal from "../components/AuthModal";

// ============================================================================
// 1. ĐỊNH NGHĨA KIỂU DỮ LIỆU (TYPES & INTERFACES)
// ============================================================================

/**
 * Interface dữ liệu trả về từ Backend NestJS API (GET /products)
 */
export interface BackendProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
}

/**
 * Interface sản phẩm đồ uống trong menu BrewLite mở rộng cho Frontend
 */
export interface Product extends BackendProduct {
  category: string;
  stock: number;
  description?: string;
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
 */
export interface AddedCartItemSummary {
  productName: string;
  sizeName: string;
  sizeExtraPrice: number;
  toppings: string[];
  quantity: number;
  totalPrice: number;
}

// ============================================================================
// 2. DANH MỤC & CẤU HÌNH TÙY CHỌN (OPTIONS)
// ============================================================================

/**
 * Danh sách các danh mục thức uống để lọc
 */
export const CATEGORIES = ["Tất cả", "Cà phê", "Trà trái cây", "Khác"] as const;

/**
 * Danh sách tùy chọn kích cỡ (Size): Nhỏ, Vừa, Lớn
 */
export const SIZE_OPTIONS: SizeOption[] = [
  { id: "S", name: "Nhỏ", extraPrice: 0 },
  { id: "M", name: "Vừa", extraPrice: 5000 },
  { id: "L", name: "Lớn", extraPrice: 10000 },
];

/**
 * Danh sách tùy chọn Topping: Trân châu trắng, Thạch nha đam, Kem Cheese...
 */
export const TOPPING_OPTIONS: ToppingOption[] = [
  { id: "white_pearl", name: "Trân châu trắng", extraPrice: 10000 },
  { id: "aloe_vera", name: "Thạch nha đam", extraPrice: 10000 },
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


        //login
  type AuthUser = {
  id: string;
  email: string;
  phone: string;
  loyaltyPoints: number;
};


 
export default function MenuPage() {
  // kiểm tra đăng nhập 
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  // Xử lý khi đăng nhập thành công
const handleLoginSuccess = (user: AuthUser, token: string) => {
  setAuthUser(user);
  localStorage.setItem("brewlite_access_token", token);
  localStorage.setItem("brewlite_user", JSON.stringify(user));
};

// Xử lý đăng xuất
const handleLogout = () => {
  localStorage.removeItem("brewlite_access_token");
  localStorage.removeItem("brewlite_user");
  setAuthUser(null);
};

  // Quản lý danh sách sản phẩm lấy từ Backend API
  const [products, setProducts] = useState<Product[]>([]);
  // Trạng thái đang tải dữ liệu (Loading)
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Trạng thái lỗi khi gọi API (Error)
  const [error, setError] = useState<string | null>(null);

  // Danh mục đang được chọn để lọc (Tất cả, Cà phê, Trà trái cây, Khác)
  const [selectedCategory, setSelectedCategory] = useState<string>("Tất cả");

  const { addToCart, totalItemsCount, totalAmount, isHydrated } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);

  // --------------------------------------------------------------------------
  // STATE CHO MODAL CHI TIẾT & TÙY CHỌN MÓN
  // --------------------------------------------------------------------------
  // Sản phẩm đang được chọn mở modal tùy chọn (null nếu modal đóng)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  // Kích cỡ được chọn (mặc định là Size Nhỏ)
  const [selectedSize, setSelectedSize] = useState<SizeOption>(SIZE_OPTIONS[0]);
  // Danh sách ID của các topping đã tick chọn (checkbox đa chọn)
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  // Số lượng món được chọn (mặc định là 1)
  const [quantity, setQuantity] = useState<number>(1);
  const [quantityInput, setQuantityInput] = useState("1");

  // --------------------------------------------------------------------------
  // STATE CHO MODAL THÔNG BÁO THÀNH CÔNG (SUCCESS DIALOG POPUP)
  // --------------------------------------------------------------------------
  const [addedItemSummary, setAddedItemSummary] =
    useState<AddedCartItemSummary | null>(null);

  /**
   * Gọi API NestJS tại http://localhost:3001/products
   * Phân loại category theo tên:
   *  - Chứa "cà phê", "americano", "cappuccino" -> 'Cà phê'
   *  - Chứa "trà", "tea" -> 'Trà trái cây'
   *  - Các món còn lại -> 'Khác'
   */
  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3001/products");

      if (!response.ok) {
        throw new Error(
          `Không thể tải thực đơn (Mã lỗi ${response.status}: ${response.statusText})`
        );
      }

      const data: BackendProduct[] = await response.json();

      // Bổ sung category theo tên và thiết lập giá trị mặc định cho stock/description
      const mappedProducts: Product[] = data.map((item) => {
        const lowerName = item.name.toLowerCase();

        let category: string;
        let defaultDescription: string;

        if (
          lowerName.includes("cà phê") ||
          lowerName.includes("americano") ||
          lowerName.includes("cappuccino")
        ) {
          category = "Cà phê";
          defaultDescription =
            "Hương vị cà phê Robusta & Arabica đậm đà, thơm nồng truyền thống";
        } else if (lowerName.includes("trà") || lowerName.includes("tea")) {
          category = "Trà trái cây";
          defaultDescription =
            "Trà tươi thượng hạng thanh mát, sảng khoái từng ngụm";
        } else {
          category = "Khác";
          defaultDescription =
            "Thức uống đặc biệt thơm ngon, tươi mát sảng khoái";
        }

        return {
          ...item,
          category,
          stock: (item as unknown as { stock?: number }).stock ?? 20,
          description:
            (item as unknown as { description?: string }).description ??
            defaultDescription,
        };
      });

      setProducts(mappedProducts);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Không thể kết nối đến máy chủ API. Vui lòng kiểm tra NestJS backend.";
      console.error("Lỗi khi tải dữ liệu từ Backend:", err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

// giữ trạng thái đăng nhập khi mở lại trang
  useEffect(() => {
  try {
    const savedUser = localStorage.getItem("brewlite_user");
    const savedToken = localStorage.getItem("brewlite_access_token");

    if (savedUser && savedToken) {
      setAuthUser(JSON.parse(savedUser) as AuthUser);
    }
  } catch (error) {
    console.error("Không thể khôi phục thông tin đăng nhập:", error);
    localStorage.removeItem("brewlite_user");
    localStorage.removeItem("brewlite_access_token");
  }
}, []);

  // Gọi fetch API khi component mount lần đầu
  useEffect(() => {
    // The request updates page state after its asynchronous response resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
  }, [fetchProducts]);

  /**
   * Mở Modal Chi tiết & tùy chọn khi click vào món
   * Khởi tạo lại các tùy chọn mặc định (Size Nhỏ, chưa chọn topping nào, số lượng = 1)
   */
  const handleOpenDetailModal = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(SIZE_OPTIONS[0]);
    setSelectedToppings([]);
    setQuantity(1);
    setQuantityInput("1");
  };

  /**
   * Đóng Modal Chi tiết món
   */
  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  /**
   * Xử lý giảm số lượng (tối thiểu là 1)
   */
  const handleDecreaseQuantity = () => {
    const nextQuantity = Math.max(1, quantity - 1);
    setQuantity(nextQuantity);
    setQuantityInput(String(nextQuantity));
  };

  /**
   * Xử lý tăng số lượng (tối đa không vượt quá tồn kho stock của sản phẩm)
   */
  const handleIncreaseQuantity = () => {
    if (!selectedProduct) return;
    const maxStock = selectedProduct.stock || 99;
    const nextQuantity = Math.min(maxStock, quantity + 1);
    setQuantity(nextQuantity);
    setQuantityInput(String(nextQuantity));
  };

  const handleQuantityInputChange = (value: string) => {
    setQuantityInput(value);
    if (!/^\d+$/.test(value) || !selectedProduct) return;

    const parsedQuantity = Number(value);
    if (Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0) {
      setQuantity(Math.min(selectedProduct.stock || 99, parsedQuantity));
    }
  };

  const handleQuantityInputBlur = () => {
    const parsedQuantity = Number(quantityInput);
    const normalizedQuantity =
      Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0
        ? Math.min(selectedProduct?.stock || 99, parsedQuantity)
        : quantity;
    setQuantity(normalizedQuantity);
    setQuantityInput(String(normalizedQuantity));
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
   * TÍNH TOÁN ĐƠN GIÁ 1 LY:
   * Công thức: Giá gốc + Giá size + Giá các topping đã tick
   */
  const calculateUnitPrice = (): number => {
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
   * TÍNH TOÁN TỔNG TIỀN ĐỘNG (Dynamic Total Price Calculation):
   * Công thức: (Giá gốc + Giá size + Topping) * Số lượng
   */
  const calculateTotalPrice = (itemQuantity = quantity): number => {
    return calculateUnitPrice() * itemQuantity;
  };

  /**
   * Xử lý khi nhấn nút "Thêm vào giỏ" trong Modal:
   * Cập nhật đúng số lượng & tổng tiền, mở Modal Popup Thông Báo Thành Công
   */
  const handleAddToCart = () => {
    if (!selectedProduct) return;

    const parsedQuantity = Number(quantityInput);
    const quantityToAdd =
      Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0
        ? Math.min(selectedProduct.stock || 99, parsedQuantity)
        : quantity;
    setQuantity(quantityToAdd);
    setQuantityInput(String(quantityToAdd));
    const totalPrice = calculateTotalPrice(quantityToAdd);
    const toppingNames = selectedToppings
      .map((id) => TOPPING_OPTIONS.find((t) => t.id === id)?.name)
      .filter((name): name is string => Boolean(name));

    // 1. Lưu thông tin tóm tắt món vừa thêm vào state
    setAddedItemSummary({
      productName: selectedProduct.name,
      sizeName: selectedSize.name,
      sizeExtraPrice: selectedSize.extraPrice,
      toppings: toppingNames,
      quantity: quantityToAdd,
      totalPrice: totalPrice,
    });

    addToCart({
      id: selectedProduct.id,
      name: selectedProduct.name,
      price: calculateUnitPrice(),
      quantity: quantityToAdd,
      size: {
        id: selectedSize.id,
        name: selectedSize.name,
        extraPrice: selectedSize.extraPrice,
      },
      toppings: selectedToppings
        .map((id) => TOPPING_OPTIONS.find((topping) => topping.id === id))
        .filter((topping): topping is ToppingOption => Boolean(topping))
        .map(({ id, name, extraPrice }) => ({ id, name, extraPrice })),
      imageUrl: selectedProduct.imageUrl,
    });

    // 3. Đóng Modal chi tiết món
    handleCloseModal();
  };

  /**
   * Đóng Modal thông báo thành công để tiếp tục chọn món
   */
  const handleCloseSuccessModal = () => {
    setAddedItemSummary(null);
  };

  /**
   * Lọc danh sách sản phẩm theo danh mục được chọn
   */
  const displayedProducts =
    selectedCategory === "Tất cả"
      ? products
      : products.filter((item) => item.category === selectedCategory);

  return (
    // Bố cục tổng thể: Nền xám/ấm sáng sủa, căn giữa màn hình chuẩn Mobile-First (max-w-md), font-sans hiện đại
    <div className="min-h-screen bg-stone-100 flex justify-center text-stone-800 antialiased font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <main className="w-full max-w-md min-h-screen bg-[#FCFBF8] shadow-xl flex flex-col relative pb-36">
        {/* ------------------------------------------------------------------ */}
        {/* HEADER: Tên quán, Subtitle và Icon Menu                             */}
        {/* ------------------------------------------------------------------ */}
        
<header className="sticky top-0 z-20 bg-[#FCFBF8]/90 backdrop-blur-md border-b border-stone-200/70 px-4 py-3.5 transition-all">
  <div className="flex items-center justify-between gap-2">
    {/* Thương hiệu BrewLite */}
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block animate-pulse" />
        <h1 className="text-xl font-bold tracking-tight text-emerald-950 font-sans">
          BrewLite
        </h1>
      </div>
      <p className="text-[11px] font-medium tracking-wide uppercase text-amber-900/75 mt-0.5">
        Cashless Drink Ordering
      </p>
    </div>

    {/* Đăng nhập / Thông tin tài khoản / Đăng xuất */}
    <div className="flex items-center gap-2 shrink-0">
      {authUser ? (
        <>
          <span
            className="text-[11px] font-semibold text-emerald-950 max-w-[95px] truncate"
            title={authUser.phone}
          >
            {authUser.phone}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="px-2.5 py-2 rounded-xl bg-stone-200/80 hover:bg-stone-300 text-stone-700 text-xs font-semibold transition-colors"
          >
            Đăng xuất
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setIsAuthOpen(true)}
          className="px-3 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold transition-colors"
        >
          Đăng nhập
        </button>
      )}

      {/* Giữ nguyên nút menu */}
      <button
        type="button"
        aria-label="Mở danh mục menu"
        onClick={() => alert("Menu tùy chọn đang được phát triển")}
        className="p-2 rounded-xl text-stone-600 hover:text-emerald-900 hover:bg-stone-200/60 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
      >
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
  </div>

  {/* Thanh công cụ kiểm thử: giữ nguyên */}
  <div className="mt-3 pt-2 border-t border-stone-200/50 flex items-center justify-between text-xs">
    <span className="text-[11px] font-medium text-stone-600 flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-700" />
      Thực đơn hôm nay
    </span>

    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={fetchProducts}
        className="px-2 py-0.5 rounded-md bg-stone-200/80 hover:bg-stone-300 text-stone-700 text-[10px] font-medium transition-colors cursor-pointer"
        title="Tải lại dữ liệu từ Backend API"
      >
        Tải lại API
      </button>
      <button
        type="button"
        onClick={() => setProducts([])}
        className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-medium transition-colors cursor-pointer"
        title="Giả lập danh sách rỗng để nghiệm thu Empty state"
      >
        Test Empty
      </button>
    </div>
  </div>
</header>


        {/* ------------------------------------------------------------------ */}
        {/* BANNER CHÀO MỪNG SANG TRỌNG TONE XANH RÊU                          */}
        {/* ------------------------------------------------------------------ */}
        <div className="px-3.5 pt-3">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-950 p-4 text-white shadow-md shadow-emerald-950/15">
            {/* Hiệu ứng đốm sáng trang trí mờ ảo */}
            <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute top-0 right-10 w-16 h-16 bg-amber-400/10 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-700/50 backdrop-blur-xs border border-emerald-500/30 text-[10px] font-semibold text-emerald-200 tracking-wide uppercase">
                  <span>✦</span> BrewLite Special
                </div>
                <p className="text-sm sm:text-base font-semibold leading-snug tracking-tight text-white max-w-[220px]">
                  Thưởng thức tách cà phê đậm vị mỗi ngày
                </p>
              </div>

              {/* Icon tách cà phê sang trọng */}
              <div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-amber-200 shadow-inner">
                <svg
                  className="w-6 h-6 stroke-current"
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
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* THANH LỌC DANH MỤC CUỘN NGANG (CATEGORY TABS)                      */}
        {/* ------------------------------------------------------------------ */}
        <div className="px-3.5 pt-3 pb-1">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {CATEGORIES.map((category) => {
              const isActive = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-emerald-800 text-white shadow-sm shadow-emerald-900/30 scale-100"
                      : "bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50 hover:text-stone-900 active:scale-95"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* NỘI DUNG CHÍNH: LƯỚI SẢN PHẨM HOẶC TRẠNG THÁI SKELETON/ERROR/EMPTY  */}
        {/* ------------------------------------------------------------------ */}
        <section className="flex-1 px-3.5 pt-3">
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
                    <div className="w-full aspect-square bg-stone-200 rounded-2xl mb-2.5" />
                    {/* Skeleton tên món */}
                    <div className="h-4 bg-stone-200 rounded w-4/5 mb-1.5" />
                    {/* Skeleton giá tiền */}
                    <div className="h-3.5 bg-stone-200 rounded w-2/5 mt-auto" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TRƯỜNG HỢP 2: ERROR STATE (Khi có lỗi kết nối API hoặc Server) */}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mb-3 shadow-inner">
                <svg
                  className="w-8 h-8 stroke-current"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="text-base font-bold tracking-tight text-stone-900">
                Không thể tải thực đơn
              </h2>
              <p className="text-xs text-stone-500 mt-1 max-w-[260px] leading-relaxed">
                {error}
              </p>
              <button
                type="button"
                onClick={fetchProducts}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Thử lại ngay
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 3: EMPTY STATE (Khi danh sách sản phẩm rỗng) */}
          {!isLoading && !error && products.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center mb-3 shadow-inner">
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
              <h2 className="text-base font-bold tracking-tight text-stone-800">
                Chưa có món nào hôm nay
              </h2>
              <p className="text-xs text-stone-500 mt-1 max-w-[220px]">
                Danh sách thức uống hiện đang trống hoặc đang cập nhật công thức mới.
              </p>
              <button
                type="button"
                onClick={fetchProducts}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Tải lại thực đơn
              </button>
            </div>
          )}

          {/* TRƯỜNG HỢP 4: DANH SÁCH SẢN PHẨM (Bố cục 2 cột: grid grid-cols-2 gap-3) */}
          {!isLoading && !error && products.length > 0 && (
            <div>
              {/* Tiêu đề nhóm thực đơn */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                  {selectedCategory === "Tất cả"
                    ? `Món nổi bật (${displayedProducts.length})`
                    : `${selectedCategory} (${displayedProducts.length})`}
                </span>
                <span className="text-[11px] text-stone-600">
                  Chạm để tùy chọn món
                </span>
              </div>

              {/* Hiển thị khi danh mục lọc không có món */}
              {displayedProducts.length === 0 ? (
                <div className="py-12 px-4 text-center bg-white rounded-2xl border border-stone-200/70">
                  <p className="text-xs text-stone-500">
                    Không tìm thấy món nào trong danh mục này.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("Tất cả")}
                    className="mt-3 text-xs font-semibold text-emerald-800 underline underline-offset-2 cursor-pointer"
                  >
                    Xem tất cả món
                  </button>
                </div>
              ) : (
                /* Lưới sản phẩm 2 cột */
                <div className="grid grid-cols-2 gap-3">
                  {displayedProducts.map((product) => (
                    <article
                      key={product.id}
                      onClick={() => handleOpenDetailModal(product)}
                      className="group bg-white rounded-2xl p-2.5 shadow-sm hover:shadow-md border border-stone-200/70 hover:border-emerald-300 transition-all duration-200 cursor-pointer flex flex-col active:scale-[0.98] select-none"
                    >
                      {/* Khung ảnh món ăn hiển thị bằng trường imageUrl */}
                      <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-stone-100 mb-2.5">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {/* Tag số lượng có sẵn */}
                        <span className="absolute top-2 right-2 bg-black/45 backdrop-blur-md text-white text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/10 shadow-xs">
                          Còn {product.stock}
                        </span>
                      </div>

                      {/* Tên món và giá tiền */}
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <h2 className="text-sm font-semibold tracking-tight text-stone-900 line-clamp-1 group-hover:text-emerald-900 transition-colors">
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
                          <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center text-sm font-bold shadow-xs group-hover:bg-emerald-800 group-hover:text-white group-hover:shadow-md group-hover:shadow-emerald-900/30 group-hover:scale-105 transition-all duration-200">
                            +
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
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
              onClick={() => setIsCartOpen(true)}
              className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-semibold py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-900/20 active:scale-[0.99] transition-all flex items-center justify-between cursor-pointer"
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
                    {isHydrated ? totalItemsCount : 0}
                  </span>
                </div>
                <span className="text-sm font-semibold tracking-wide">
                  Xem giỏ hàng ({isHydrated ? totalItemsCount : 0})
                </span>
              </div>

              {/* Tổng số tiền món đã thêm */}
              <div className="flex items-center gap-1.5 text-xs text-emerald-100 font-bold">
                <span>
                  {totalAmount > 0 ? formatPriceVND(totalAmount) : "0 ₫"}
                </span>
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

        <CartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
        />

        {/* ------------------------------------------------------------------ */}
        {/* MODAL / BOTTOM SHEET CHI TIẾT VÀ TÙY CHỌN MÓN                      */}
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
                className="absolute top-3 right-3 z-20 flex items-center gap-1 px-3 py-1.5 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white text-xs font-medium backdrop-blur-md shadow-md active:scale-95 transition-all cursor-pointer"
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
                    <h2 className="text-xl font-bold tracking-tight text-stone-900 font-sans">
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

                {/* 3. TÙY CHỌN KÍCH CỠ (SIZE): Nhỏ, Vừa, Lớn */}
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
                          className={`py-2 px-1 rounded-xl text-center border transition-all duration-200 flex flex-col items-center justify-center cursor-pointer ${
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
                            {size.extraPrice > 0
                              ? `+${formatPriceVND(size.extraPrice)}`
                              : "Mặc định"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. TÙY CHỌN TOPPING (CHECKBOX ĐA CHỌN): Trân châu trắng, Thạch nha đam... */}
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

              {/* FOOTER CỐ ĐỊNH TRONG MODAL: BỘ CHỌN SỐ LƯỢNG & NÚT THÊM VÀO GIỎ */}
              <div className="p-3.5 border-t border-stone-200/80 bg-white/95 backdrop-blur-sm space-y-3">
                {/* KHỐI BỘ CHỌN SỐ LƯỢNG (QUANTITY STEPPER) */}
                <div className="flex items-center justify-between px-1">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 block">
                      Số lượng
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Còn {selectedProduct.stock} món trong kho
                    </span>
                  </div>

                  {/* Nút - / Số lượng / Nút + dạng Stepper bo tròn */}
                  <div className="flex items-center gap-2.5 bg-stone-100 p-1 rounded-2xl border border-stone-200/80">
                    <button
                      type="button"
                      disabled={quantity <= 1}
                      onClick={handleDecreaseQuantity}
                      aria-label="Giảm số lượng"
                      className="w-8 h-8 rounded-xl bg-white border border-stone-200 text-stone-800 flex items-center justify-center font-bold text-base shadow-xs disabled:opacity-35 disabled:cursor-not-allowed hover:bg-stone-50 active:scale-95 transition-all cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Nhập số lượng món"
                      value={quantityInput}
                      onChange={(event) =>
                        handleQuantityInputChange(event.target.value)
                      }
                      onBlur={handleQuantityInputBlur}
                      className="h-8 w-14 rounded-lg border border-stone-200 bg-white text-center text-sm font-bold text-stone-900 outline-none focus:border-emerald-700"
                    />
                    <button
                      type="button"
                      disabled={quantity >= selectedProduct.stock}
                      onClick={handleIncreaseQuantity}
                      aria-label="Tăng số lượng"
                      className="w-8 h-8 rounded-xl bg-white border border-stone-200 text-stone-800 flex items-center justify-center font-bold text-base shadow-xs disabled:opacity-35 disabled:cursor-not-allowed hover:bg-stone-50 active:scale-95 transition-all cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* NÚT THÊM VÀO GIỎ VỚI ĐƠN GIÁ ĐÃ NHÂN SỐ LƯỢNG */}
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-bold py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-950/20 active:scale-[0.99] transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="text-sm">
                    Thêm vào giỏ • {quantity} {quantity > 1 ? "ly" : "món"}
                  </span>
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
              <h3 className="text-lg font-bold tracking-tight text-stone-900 font-sans text-center">
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
                  <span className="font-bold tracking-tight text-stone-900 text-sm">
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

                {/* Dòng 4: Số lượng */}
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Số lượng:</span>
                  <span className="font-semibold text-stone-800">
                    {addedItemSummary.quantity} ly
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

              {/* Nút bấm 'Tiếp tục chọn món' */}
              <button
                type="button"
                onClick={handleCloseSuccessModal}
                className="w-full bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-emerald-950/20 active:scale-[0.99] transition-all text-sm cursor-pointer"
              >
                Tiếp tục chọn món
              </button>
            </div>
          </div>
        )}
        {isAuthOpen && (
  <AuthModal
    onClose={() => setIsAuthOpen(false)}
    onLoginSuccess={handleLoginSuccess}
  />
)}
      </main>
    </div>
  );
}
