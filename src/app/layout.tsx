import type { Metadata, Viewport } from "next";
import {
  Anek_Devanagari,
  Fraunces,
  JetBrains_Mono,
  Manrope,
  Tiro_Devanagari_Marathi,
} from "next/font/google";

import "./globals.css";

/** Editorial serif for display type. The optical-size axis is what keeps it
 *  from looking like a headline shrunk down when it appears at 13px. */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const anekDevanagari = Anek_Devanagari({
  subsets: ["devanagari", "latin"],
  display: "swap",
  variable: "--font-anek-devanagari",
});

/** Drawn for Marathi specifically — the eyelash on the ल and the ligature set
 *  are Marathi's, not Hindi's. Reserved for the panel headline. */
const tiroMarathi = Tiro_Devanagari_Marathi({
  subsets: ["devanagari", "latin"],
  weight: "400",
  display: "swap",
  variable: "--font-tiro-marathi",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "महाराष्ट्र घडतो आहे — Maharashtra Is Building",
  description:
    "महाराष्ट्रात काय घडतं आहे, ते नकाशावर. An interactive record of what is being built across Maharashtra's 36 districts.",
};

export const viewport: Viewport = {
  themeColor: "#fdeed6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="mr"
      className={`${fraunces.variable} ${manrope.variable} ${anekDevanagari.variable} ${tiroMarathi.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
