
"use client";

import { useState, type FormEvent } from "react";

type AuthMode = "login" | "register";

type AuthUser = {
  id: string;
  email: string;
  phone: string;
  loyaltyPoints: number;
};

type AuthModalProps = {
  onClose: () => void;
  onLoginSuccess: (user: AuthUser, token: string) => void;
};

const API_URL = "http://localhost:3001/auth";

export default function AuthModal({
  onClose,
  onLoginSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (mode === "register") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Email không đúng định dạng.");
        return;
      }

      if (!/^0\d{9}$/.test(phone.trim())) {
        setError("Số điện thoại phải có 10 chữ số và bắt đầu bằng 0.");
        return;
      }

      if (password.length < 8) {
        setError("Mật khẩu phải có ít nhất 8 ký tự.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Mật khẩu xác nhận không khớp.");
        return;
      }
    } else {
      if (!/^0\d{9}$/.test(phone.trim())) {
        setError("Vui lòng nhập số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");
        return;
      }

      if (!password) {
        setError("Vui lòng nhập mật khẩu.");
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "login"
              ? { phone: phone.trim(), password }
              : {
                  email: email.trim(),
                  phone: phone.trim(),
                  password,
                },
          ),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        const message = Array.isArray(data.message)
          ? data.message.join("\n")
          : data.message;

        throw new Error(message || "Đã xảy ra lỗi. Vui lòng thử lại.");
      }

      if (mode === "register") {
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setError("");
        alert("Đăng ký thành công! Hãy đăng nhập bằng số điện thoại.");
        return;
      }

      if (!data.accessToken || !data.user) {
        throw new Error("Máy chủ không trả về thông tin đăng nhập hợp lệ.");
      }

      onLoginSuccess(data.user as AuthUser, data.accessToken as string);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể kết nối máy chủ. Hãy kiểm tra backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="w-full max-w-sm rounded-3xl border border-stone-200 bg-[#FCFBF8] p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-700" />
              <span className="text-sm font-bold text-emerald-950">
                BrewLite
              </span>
            </div>
            <h2
              id="auth-title"
              className="text-xl font-bold text-stone-900"
            >
              {mode === "login" ? "Chào mừng trở lại!" : "Tạo tài khoản"}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              {mode === "login"
                ? "Đăng nhập để tiếp tục trải nghiệm."
                : "Điền thông tin để tham gia BrewLite."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Đóng"
            className="rounded-xl px-3 py-1.5 text-lg text-stone-500 hover:bg-stone-200 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === "login"
                ? "bg-white text-emerald-900 shadow-sm"
                : "text-stone-500"
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === "register"
                ? "bg-white text-emerald-900 shadow-sm"
                : "text-stone-500"
            }`}
          >
            Đăng ký
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label
                htmlFor="auth-email"
                className="mb-1.5 block text-xs font-semibold text-stone-700"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ban@example.com"
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-phone"
              className="mb-1.5 block text-xs font-semibold text-stone-700"
            >
              Số điện thoại
            </label>
            <input
              id="auth-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              maxLength={10}
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="0912345678"
              className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
            />
            <p className="mt-1 text-[11px] text-stone-500">
              Gồm 10 chữ số, bắt đầu bằng 0.
            </p>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="mb-1.5 block text-xs font-semibold text-stone-700"
            >
              Mật khẩu
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "register" ? 8 : 1}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                mode === "register" ? "Ít nhất 8 ký tự" : "Nhập mật khẩu"
              }
              className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
            />
          </div>

          {mode === "register" && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="mb-1.5 block text-xs font-semibold text-stone-700"
              >
                Xác nhận mật khẩu
              </label>
              <input
                id="auth-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Nhập lại mật khẩu"
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-800 px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Đang xử lý..."
              : mode === "login"
                ? "Đăng nhập"
                : "Tạo tài khoản"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-stone-500">
          Thông tin tài khoản được gửi đến máy chủ BrewLite để xác thực.
        </p>
      </section>
    </div>
  );
}
