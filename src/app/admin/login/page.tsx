import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect("/admin");
  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="font-serif text-3xl font-bold">관리자 로그인</h1>
      <p className="mt-2 text-sm text-muted">레시피를 추가하고 고치려면 로그인하세요.</p>
      <LoginForm />
    </div>
  );
}
