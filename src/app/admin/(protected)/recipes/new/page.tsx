import { requireAdmin } from "@/lib/auth/session";
import { RecipeForm } from "../../recipe-form";

export default async function NewRecipePage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold">새 레시피</h1>
      <RecipeForm />
    </div>
  );
}
