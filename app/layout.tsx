import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rival",
  description: "Open source competitive intelligence dashboard powered by Tabstack"
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
