import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "관리자",
  robots: { index: false, follow: false },
};

// Admin pages read the session cookie, so they are always rendered per
// request and sent with Cache-Control: no-store (next.config.ts). CloudFront
// also bypasses its cache for /admin*.
export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</div>;
}
