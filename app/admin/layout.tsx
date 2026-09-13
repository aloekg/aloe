import { MainContainer, MobileHeader, Title } from "@/components";
import { requireAdmin } from "@/lib/auth";
import AdminNav from "./AdminNav";

export const metadata = { title: "Админ", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Pages re-gate independently — a layout does not guard the pages nested under it in RSC,
  // they render in parallel. The lookup is request-cached, so this costs no extra round trip.
  const { role } = await requireAdmin();

  return (
    <>
      <MobileHeader title="Админ" withGoToMainButton />
      <MainContainer>
        <Title className="hidden md:block mb-4 md:mb-6">Админ</Title>
        <AdminNav isSuperAdmin={role === "superadmin"} />
        {children}
      </MainContainer>
    </>
  );
}
