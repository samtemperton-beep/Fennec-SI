import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Fennec SI — AI-powered portfolio tracker",
  description: "AI-powered Stock Intelligence for NZ, ASX & US markets",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace' } }} />
      </body>
    </html>
  );
}
