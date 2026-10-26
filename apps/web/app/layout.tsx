import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "WALL-A | AI Agent Firewall",
  description: "Firewall for AI agents. Blocks risky tool calls, asks a human before anything sensitive, and keeps a signed audit trail.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0a0d1a] text-slate-300">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
