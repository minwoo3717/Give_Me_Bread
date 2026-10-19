import Link from "next/link";
import { listAllRecipes } from "@/lib/recipes";
import { requireAdmin } from "@/lib/auth/session";
import { deleteRecipeAction, setRecipeStatusAction } from "../actions";
import { ConfirmSubmit } from "./confirm-submit";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export default async function AdminRecipesPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const [recipes, params] = await Promise.all([listAllRecipes(), searchParams]);
  const savedId = typeof params.saved === "string" ? Number(params.saved) : null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold">레시피 관리</h1>
        <Link
          href="/admin/recipes/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          새 레시피
        </Link>
      </div>

      {savedId && (
        <p role="status" className="mt-4 rounded-lg bg-ok-soft px-4 py-2 text-sm text-ok">
          저장했습니다. 공개 페이지는 CDN 캐시가 비워지는 대로(보통 1분 이내) 반영됩니다.
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">제목</th>
              <th className="px-4 py-3 font-medium">주소</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">수정일</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {recipes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  아직 레시피가 없습니다.
                </td>
              </tr>
            )}
            {recipes.map((r) => (
              <tr key={r.id} className={savedId === r.id ? "bg-accent-soft/40" : undefined}>
                <td className="px-4 py-3 font-medium">{r.title}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">/recipes/{r.slug}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      r.status === "published" ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {r.status === "published" ? "공개" : "비공개"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{dateFormat.format(r.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {r.status === "published" && (
                      <Link href={`/recipes/${r.slug}`} className="rounded-md px-2 py-1 hover:bg-surface-2">
                        보기
                      </Link>
                    )}
                    <Link href={`/admin/recipes/${r.id}/edit`} className="rounded-md px-2 py-1 hover:bg-surface-2">
                      수정
                    </Link>
                    <form action={setRecipeStatusAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={r.status === "published" ? "draft" : "published"} />
                      <button type="submit" className="rounded-md px-2 py-1 hover:bg-surface-2">
                        {r.status === "published" ? "비공개로" : "공개하기"}
                      </button>
                    </form>
                    <form action={deleteRecipeAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmSubmit message={`'${r.title}' 레시피를 삭제할까요? 되돌릴 수 없습니다.`}>삭제</ConfirmSubmit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
