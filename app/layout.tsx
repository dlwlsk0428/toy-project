import type { Metadata } from "next";
import {
  Anton,
  Archivo_Black,
  Geist_Mono,
  Inter,
  Oswald,
} from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "웹 펀치 리듬",
  description: "웹캠으로 집에서 즐기는 복싱 리듬게임",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", inter.variable, oswald.variable, anton.variable, archivoBlack.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
