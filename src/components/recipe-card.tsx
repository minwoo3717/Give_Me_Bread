import Link from "next/link";
import { formatMinutes } from "@/lib/format";
import type { RecipeSummary } from "@/lib/recipes";
import { FinancierArt } from "./financier-art";

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-lg hover:shadow-black/5">
      <div className="bg-surface-2 px-6 pt-6 text-ink">
        <FinancierArt className="mx-auto h-36 w-full max-w-xs transition-transform duration-300 group-hover:-translate-y-1" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="text-xs font-medium tracking-wide text-accent">{recipe.category}</p>
        <h3 className="font-serif text-2xl font-bold">
          <Link href={`/recipes/${recipe.slug}`} className="after:absolute after:inset-0">
            {recipe.title}
          </Link>
          {recipe.titleOriginal && (
            <span className="ml-2 align-middle text-sm font-normal text-muted">{recipe.titleOriginal}</span>
          )}
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted">{recipe.summary}</p>
        <dl className="mt-auto flex flex-wrap gap-2 pt-2 text-xs">
          <Meta label="총 소요" value={formatMinutes(recipe.totalMin)} />
          <Meta label="난이도" value={recipe.difficulty} />
          <Meta label="분량" value={`${recipe.yieldQuantity}${recipe.yieldUnit}`} />
        </dl>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
