"use server";

import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  validateNewPassword,
  verifyPassword,
  verifyPasswordLimited,
} from "@/lib/auth/password";
import { completeLoginAttempt, releaseLoginAttempt, reserveLoginAttempt } from "@/lib/auth/rate-limit";
import {
  createSession,
  destroyCurrentSession,
  destroyOtherSessions,
  requireAdmin,
} from "@/lib/auth/session";
import { invalidateCdn } from "@/lib/cdn";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { errorFields, logger } from "@/lib/logger";
import { fieldErrors, recipeInputSchema } from "@/lib/recipe-schema";
import {
  SlugTakenError,
  createRecipe,
  deleteRecipe,
  setRecipeStatus,
  updateRecipe,
} from "@/lib/recipes";
import { clientIpFrom, rateLimitKey } from "@/lib/request-meta";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: string };

// ---- auth ---------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

const GENERIC_LOGIN_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다.";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR };
  const { email, password } = parsed.data;

  const requestHeaders = await headers();
  const ip = clientIpFrom(requestHeaders);
  const ipKey = rateLimitKey(ip);

  const gate = await reserveLoginAttempt(ipKey, email);
  if (!gate.allowed) {
    logger.warn("login blocked by rate limit", { ip, email });
    return { error: "로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도하세요." };
  }

  const [user] = await getDb()
    .select({ id: adminUsers.id, passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(sql`lower(${adminUsers.email}) = ${email}`)
    .limit(1);

  // Always run one scrypt verification so response time does not reveal
  // whether the email exists.
  const verdict = await verifyPasswordLimited(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (verdict === "busy") {
    await releaseLoginAttempt(gate.attemptId);
    return { error: "로그인 요청이 몰리고 있습니다. 잠시 후 다시 시도하세요." };
  }
  const ok = Boolean(user && verdict);
  await completeLoginAttempt(gate.attemptId, email, ok);

  if (!user || !ok) {
    logger.warn("login failed", { ip, email });
    return { error: GENERIC_LOGIN_ERROR };
  }

  await createSession(user.id, { ip, userAgent: requestHeaders.get("user-agent") });
  await getDb().update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  logger.info("login succeeded", { ip, userId: user.id });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/admin/login");
}

const passwordChangeSchema = z.object({
  current: z.string().min(1).max(256),
  next: z.string().max(256),
  confirm: z.string().max(256),
});

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = passwordChangeSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { fieldErrors: { confirm: "새 비밀번호가 서로 다릅니다." } };
  const problem = validateNewPassword(next);
  if (problem) return { fieldErrors: { next: problem } };

  const [user] = await getDb()
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.id));
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    return { fieldErrors: { current: "현재 비밀번호가 올바르지 않습니다." } };
  }

  const passwordHash = await hashPassword(next);
  try {
    await getDb().update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, admin.id));
  } catch (err) {
    // Drizzle puts bound parameters (here: the new hash) in its error
    // message; rethrow without them so nothing logs the hash.
    logger.error("password update failed", errorFields(err));
    throw new Error("password update failed");
  }
  await destroyOtherSessions(admin.id, admin.sessionId);
  logger.info("admin password changed", { userId: admin.id });
  return { ok: "비밀번호를 바꿨습니다. 다른 기기의 로그인은 모두 해제됐습니다." };
}

// ---- recipes ------------------------------------------------------------

const idSchema = z.coerce.number().int().positive();

function parsePayload(formData: FormData) {
  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length > 200_000) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function saveRecipeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const payload = parsePayload(formData);
  if (!payload) return { error: "폼 데이터를 읽지 못했습니다. 새로고침 후 다시 시도하세요." };

  const parsed = recipeInputSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: "입력값을 확인하세요.", fieldErrors: fieldErrors(parsed.error) };
  }

  const idValue = formData.get("id");
  const intent = formData.get("intent");
  let id: number;
  try {
    if (idValue) {
      id = idSchema.parse(idValue);
      const found = await updateRecipe(id, parsed.data);
      if (!found) return { error: "레시피를 찾을 수 없습니다. 이미 삭제됐을 수 있어요." };
    } else {
      id = await createRecipe(parsed.data, intent === "publish" ? "published" : "draft");
    }
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return { error: "입력값을 확인하세요.", fieldErrors: { slug: "이미 사용 중인 주소입니다." } };
    }
    throw err;
  }

  logger.info("recipe saved", { id, slug: parsed.data.slug, created: !idValue });
  after(() => invalidateCdn(`recipe-${id}-saved`));
  redirect(`/admin?saved=${id}`);
}

export async function setRecipeStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const status = z.enum(["draft", "published"]).parse(formData.get("status"));
  const slug = await setRecipeStatus(id, status);
  if (slug) {
    logger.info("recipe status changed", { id, slug, status });
    after(() => invalidateCdn(`recipe-${id}-${status}`));
  }
  redirect("/admin");
}

export async function deleteRecipeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const slug = await deleteRecipe(id);
  if (slug) {
    logger.info("recipe deleted", { id, slug });
    after(() => invalidateCdn(`recipe-${id}-deleted`));
  }
  redirect("/admin");
}
