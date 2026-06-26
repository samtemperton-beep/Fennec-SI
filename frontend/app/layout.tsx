import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Fennec SI — AI-Powered Portfolio Tracker",
  description: "AI-powered Stock Intelligence for NZ, ASX & US markets",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fennec SI",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192" },
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
      </head>
      <body>
        {children}
        <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace' } }} />
      </body>
    </html>
  );
}
