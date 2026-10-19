import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getRecipeById, toRecipeInput } from "@/lib/recipes";
import { RecipeForm } from "../../../recipe-form";

export default async function EditRecipePage({ params }: PageProps<"/admin/recipes/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) notFound();
  const recipe = await getRecipeById(recipeId);
  if (!recipe) notFound();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold">{recipe.title} 수정</h1>
        <p className="text-sm text-muted">
          {recipe.status === "published" ? (
            <>
              공개 중 ·{" "}
              <Link href={`/recipes/${recipe.slug}`} className="text-accent underline-offset-2 hover:underline">
                공개 페이지 보기
              </Link>
            </>
          ) : (
            "비공개 (목록에서 공개할 수 있어요)"
          )}
        </p>
      </div>
      <RecipeForm recipeId={recipe.id} initial={toRecipeInput(recipe)} />
    </div>
  );
}
