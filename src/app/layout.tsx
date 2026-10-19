import type { Metadata, Viewport } from "next";
import { Gowun_Batang } from "next/font/google";
import Link from "next/link";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";
import "./globals.css";

// Self-hosted at build time by next/font, so the CSP can stay font-src 'self'.
const gowun = Gowun_Batang({
  weight: ["400", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-gowun",
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${SITE_NAME} · ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#17120e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${gowun.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          본문으로 건너뛰기
        </a>
        <header className="no-print border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75 sticky top-0 z-40">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-serif text-lg font-bold tracking-tight">
              <span aria-hidden className="inline-block h-3 w-5 rounded-[3px] bg-gold shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]" />
              {SITE_NAME}
            </Link>
            <nav aria-label="주요 메뉴" className="text-sm text-muted">
              <Link href="/#recipes" className="rounded-md px-2 py-1 hover:text-ink">
                레시피
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="no-print border-t border-line">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-8 text-sm text-muted sm:px-6">
            <p className="font-serif text-ink">{SITE_NAME}</p>
            <p>{SITE_TAGLINE}. 모든 배합은 가정용 오븐 기준이며, 오븐마다 온도 차이가 있을 수 있어요.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
