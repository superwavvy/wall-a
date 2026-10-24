import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WALL-A | Agent Firewall",
  description: "Runtime security gateway for AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-zinc-950 text-zinc-300">
        {children}
      </body>
    </html>
  );
}
