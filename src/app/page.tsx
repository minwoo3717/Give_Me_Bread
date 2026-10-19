import { RecipeCard } from "@/components/recipe-card";
import { listPublishedRecipes } from "@/lib/recipes";
import { SITE_TAGLINE } from "@/lib/site";

// Rendered per request from Postgres (never at build time, when CI has no
// database). CloudFront caches the HTML; see next.config.ts.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const recipes = await listPublishedRecipes();

  return (
    <>
      <section className="border-b border-line bg-surface-2/60">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-sm font-medium text-accent">{SITE_TAGLINE}</p>
          <h1 className="mt-3 max-w-2xl font-serif text-4xl font-bold leading-tight sm:text-5xl">
            저울 하나로 시작하는
            <br />
            실패 없는 홈베이킹
          </h1>
          <p className="mt-5 max-w-xl leading-relaxed text-muted">
            모든 재료를 그램으로 적고, 왜 그렇게 하는지까지 설명합니다. 원하는 개수만큼 배합을 바꿔 계산하고, 단계마다
            체크하면서 따라 해 보세요.
          </p>
        </div>
      </section>

      <section id="recipes" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-12 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-2xl font-bold">레시피</h2>
          <p className="text-sm text-muted">{recipes.length}개</p>
        </div>
        {recipes.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            아직 공개된 레시피가 없어요. 곧 첫 레시피가 올라옵니다.
          </p>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="flex">
                <RecipeCard recipe={recipe} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
