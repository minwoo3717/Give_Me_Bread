import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FinancierArt } from "@/components/financier-art";
import { IngredientScaler } from "@/components/ingredient-scaler";
import { StepChecklist } from "@/components/step-checklist";
import { formatMinutes } from "@/lib/format";
import { recipeJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { getPublishedRecipe } from "@/lib/recipes";
import { siteUrl } from "@/lib/site";

// Per-request render from Postgres; CloudFront caches it (next.config.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/recipes/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await getPublishedRecipe(slug);
  if (!recipe) return { title: "레시피를 찾을 수 없어요", robots: { index: false } };
  const title = recipe.titleOriginal ? `${recipe.title} (${recipe.titleOriginal}) 레시피` : `${recipe.title} 레시피`;
  return {
    title,
    description: recipe.summary,
    alternates: { canonical: `/recipes/${recipe.slug}` },
    openGraph: { type: "article", title, description: recipe.summary, url: `/recipes/${recipe.slug}` },
  };
}

export default async function RecipePage({ params }: PageProps<"/recipes/[slug]">) {
  const { slug } = await params;
  const recipe = await getPublishedRecipe(slug);
  if (!recipe) notFound();

  const timeline = [
    { label: "준비", value: recipe.prepMin },
    { label: "휴지", value: recipe.restMin },
    { label: "굽기", value: recipe.bakeMin },
  ].filter((t) => t.value > 0);

  return (
    <article className="pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(recipeJsonLd(recipe, siteUrl())) }}
      />

      <header className="border-b border-line bg-surface-2/60">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-center md:py-14">
          <div>
            <nav aria-label="이동 경로" className="no-print text-sm text-muted">
              <Link href="/" className="hover:text-ink">
                홈
              </Link>
              <span aria-hidden> / </span>
              <span>{recipe.category}</span>
            </nav>
            <h1 className="mt-3 font-serif text-4xl font-bold sm:text-5xl">
              {recipe.title}
              {recipe.titleOriginal && (
                <span className="ml-3 align-middle text-lg font-normal text-muted">{recipe.titleOriginal}</span>
              )}
            </h1>
            <p className="mt-4 max-w-xl leading-relaxed text-muted">{recipe.summary}</p>
            <dl className="mt-6 grid max-w-md grid-cols-3 gap-3">
              <Stat label="총 소요" value={formatMinutes(recipe.totalMin)} />
              <Stat label="난이도" value={recipe.difficulty} />
              <Stat label="분량" value={`${recipe.yieldQuantity}${recipe.yieldUnit}`} />
            </dl>
          </div>
          <div className="text-ink">
            <FinancierArt className="mx-auto w-full max-w-sm" />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <aside className="flex flex-col gap-8">
          <section aria-labelledby="ingredients-heading" className="rounded-2xl border border-line bg-surface p-5">
            <h2 id="ingredients-heading" className="font-serif text-2xl font-bold">
              재료
            </h2>
            {recipe.moldNote && <p className="mt-2 text-sm leading-relaxed text-muted">{recipe.moldNote}</p>}
            <div className="mt-4">
              <IngredientScaler
                ingredients={recipe.ingredients}
                yieldQuantity={recipe.yieldQuantity}
                yieldUnit={recipe.yieldUnit}
              />
            </div>
          </section>

          <section aria-labelledby="oven-heading" className="rounded-2xl border border-line bg-surface p-5">
            <h2 id="oven-heading" className="font-serif text-xl font-bold">
              오븐
            </h2>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-serif text-3xl font-bold tabular-nums">{recipe.ovenTempC}°C</span>
              <span className="text-sm text-muted">{recipe.ovenMode}</span>
            </p>
            {recipe.ovenNote && <p className="mt-2 text-sm leading-relaxed text-muted">{recipe.ovenNote}</p>}
            {timeline.length > 0 && (
              <ol className="mt-4 flex overflow-hidden rounded-lg text-xs" aria-label="시간 배분">
                {timeline.map((t) => (
                  <li
                    key={t.label}
                    style={{ flexGrow: t.value }}
                    className="min-w-16 border-r border-surface bg-accent-soft px-2 py-2 last:border-r-0"
                  >
                    <span className="block text-muted">{t.label}</span>
                    <span className="font-medium">{formatMinutes(t.value)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {recipe.equipment.length > 0 && (
            <section aria-labelledby="equipment-heading" className="rounded-2xl border border-line bg-surface p-5">
              <h2 id="equipment-heading" className="font-serif text-xl font-bold">
                도구
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {recipe.equipment.map((item) => (
                  <li key={item} className="rounded-full bg-surface-2 px-3 py-1">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-10">
          {recipe.story && (
            <section aria-labelledby="story-heading">
              <h2 id="story-heading" className="font-serif text-2xl font-bold">
                이야기
              </h2>
              <p className="mt-3 leading-loose text-ink/90">{recipe.story}</p>
            </section>
          )}

          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className="mb-4 font-serif text-2xl font-bold">
              만드는 법
            </h2>
            <StepChecklist slug={recipe.slug} steps={recipe.steps} />
          </section>

          {recipe.tips.length > 0 && (
            <section aria-labelledby="tips-heading">
              <h2 id="tips-heading" className="font-serif text-2xl font-bold">
                실패하지 않는 팁
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {recipe.tips.map((tip) => {
                  const [head, ...rest] = tip.split(": ");
                  const hasHead = rest.length > 0;
                  return (
                    <li key={tip} className="rounded-xl border-l-4 border-gold bg-surface p-4 leading-relaxed">
                      {hasHead ? (
                        <>
                          <strong className="block">{head}</strong>
                          <span className="text-ink/90">{rest.join(": ")}</span>
                        </>
                      ) : (
                        tip
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {recipe.storage && (
            <section aria-labelledby="storage-heading">
              <h2 id="storage-heading" className="font-serif text-2xl font-bold">
                보관
              </h2>
              <p className="mt-3 leading-loose text-ink/90">{recipe.storage}</p>
            </section>
          )}

          {recipe.variations.length > 0 && (
            <section aria-labelledby="variations-heading">
              <h2 id="variations-heading" className="font-serif text-2xl font-bold">
                응용하기
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {recipe.variations.map((v) => {
                  const [name, ...rest] = v.split(": ");
                  return (
                    <li key={v} className="rounded-xl bg-surface-2 p-4 text-sm leading-relaxed">
                      {rest.length > 0 ? (
                        <>
                          <strong className="mb-1 block font-serif text-base">{name}</strong>
                          {rest.join(": ")}
                        </>
                      ) : (
                        v
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2 text-center shadow-sm shadow-black/5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
