import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Template | AI Workflows",
  description: "Advanced CSV processing and LLM-powered data workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
