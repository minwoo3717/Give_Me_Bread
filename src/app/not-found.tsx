import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-serif text-6xl font-bold text-accent">404</p>
      <h1 className="mt-4 font-serif text-2xl font-bold">찾는 레시피가 오븐에 없어요</h1>
      <p className="mt-3 text-muted">주소가 바뀌었거나 아직 공개되지 않은 레시피일 수 있어요.</p>
      <Link href="/" className="mt-8 rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-ink hover:opacity-90">
        레시피 목록으로
      </Link>
    </div>
  );
}
