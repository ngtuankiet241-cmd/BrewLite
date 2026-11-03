export type Account = {
  id: string;
  email: string;
  phone: string | null;
  loyaltyPoints: number;
  loyaltyPolicy: { spendPerPoint: number; pointValue: number };
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchAccount(signal?: AbortSignal): Promise<Account> {
  const token = localStorage.getItem("brewlite_access_token");
  if (!token) throw new Error("Vui lòng đăng nhập để xem điểm thưởng.");
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 401
      ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
      : "Không thể tải điểm thưởng. Vui lòng thử lại.");
  }
  const account: Account = await response.json();
  if (localStorage.getItem("brewlite_access_token") === token && !signal?.aborted) {
    localStorage.setItem("brewlite_user", JSON.stringify(account));
  }
  return account;
}
