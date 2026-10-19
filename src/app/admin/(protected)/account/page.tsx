import { requireAdmin } from "@/lib/auth/session";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const admin = await requireAdmin();
  return (
    <div className="max-w-md">
      <h1 className="font-serif text-3xl font-bold">계정</h1>
      <p className="mt-2 text-sm text-muted">{admin.email}</p>
      <h2 className="mt-8 font-serif text-xl font-bold">비밀번호 변경</h2>
      <PasswordForm />
    </div>
  );
}
