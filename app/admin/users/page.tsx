import { requireSuperAdmin } from "@/lib/auth";
import { listUsers } from "@/services/user.service";
import AdminUsers from "../AdminUsers";

export default async function UsersPage() {
  const { db, user } = await requireSuperAdmin();
  const { users, truncated } = await listUsers(db);

  return <AdminUsers users={users} currentUserId={user.id} truncated={truncated} />;
}
