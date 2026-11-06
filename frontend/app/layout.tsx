import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Fennec SI — Save & Invest",
  description: "Fennec SI (Save & Invest) puts your money in one place for New Zealanders: bank accounts, budgets, bills, goals, KiwiSaver and NZ, ASX and US shares, with an AI assistant that knows your numbers.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fennec",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#2C6E6A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Apply saved theme before paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('theme') || 'dark';
              document.documentElement.setAttribute('data-theme', t);
            } catch(e){}
          })();
        `}} />
        {/* A failed sign-in link can land on any page (Supabase falls back to the
            Site URL) with the reason in the hash. Take it to the sign-in page,
            which explains it (lib/authError.ts). */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var h = location.hash;
              if (h.indexOf('error_code=') > -1 && location.pathname !== '/login') {
                location.replace('/login?' + h.slice(1));
              }
            } catch(e){}
          })();
        `}} />
      </head>
      <body>
        {children}
        <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace' } }} />
      </body>
    </html>
  );
}
