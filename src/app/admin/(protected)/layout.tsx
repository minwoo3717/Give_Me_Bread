import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { logoutAction } from "../actions";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <nav aria-label="관리자 메뉴" className="flex gap-1 text-sm">
          <Link href="/admin" className="rounded-md px-3 py-1.5 hover:bg-surface-2">
            레시피
          </Link>
          <Link href="/admin/recipes/new" className="rounded-md px-3 py-1.5 hover:bg-surface-2">
            새 레시피
          </Link>
          <Link href="/admin/account" className="rounded-md px-3 py-1.5 hover:bg-surface-2">
            계정
          </Link>
        </nav>
        <form action={logoutAction} className="flex items-center gap-3 text-sm text-muted">
          <span>{admin.email}</span>
          <button type="submit" className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
            로그아웃
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
