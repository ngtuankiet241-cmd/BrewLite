import type { Metadata } from "next";
import StaffDashboard from "../../components/staff/StaffDashboard";

export const metadata: Metadata = {
  title: "Nhân viên | BrewLite",
  description: "Tiếp nhận và theo dõi tiến độ đơn hàng BrewLite.",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return <StaffDashboard />;
}
