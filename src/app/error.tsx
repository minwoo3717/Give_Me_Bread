"use client";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="font-serif text-2xl font-bold">잠시 문제가 생겼어요</h1>
      <p className="mt-3 text-muted">잠시 후 다시 시도해 주세요. 문제가 계속되면 운영자에게 알려 주세요.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">오류 코드: {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-8 rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-ink hover:opacity-90"
      >
        다시 시도
      </button>
    </div>
  );
}
