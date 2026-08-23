import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Poppins } from "next/font/google";

import "./globals.css";

/** The whole Latin voice — UI, display and figures. Fraunces used to sit above
 *  it for display type, and left with the print system: an optical-size
 *  editorial serif is the right face for something meant to read as a
 *  document, and this no longer is. Weight and tracking carry the hierarchy
 *  now; see the display tokens. */
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

/* Marathi, at every size. Poppins is drawn by Indian Type Foundry with a
   Devanagari companion to its Latin, so the two halves share the geometric
   skeleton Manrope already set for the UI — the scripts sit together instead
   of reading as two faces bolted side by side.

   Anek Devanagari held this slot before, and left because Poppins' Devanagari
   is the geometric one: circular counters, an even stroke, no calligraphic
   modulation. That is the same argument that put a geometric sans on the Latin
   side when the editorial serif went.

   Poppins is static on Google Fonts, not variable, so every weight the product
   actually sets has to be named here. 400 is body, 500/600 are UI labels and
   the eyebrow, 700 carries display and headings — and `font-synthesis-weight:
   none` in base.css means an unlisted weight is not faked, it just falls back.
   Add to this list before you reach for a new weight in a component. */
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["devanagari", "latin"],
  display: "swap",
  variable: "--font-poppins",
});

/* Tiro Devanagari Marathi used to be loaded here for headline Marathi — a
   text face drawn for Marathi specifically, with the eyelash on the ल and the
   ligature set that is Marathi's rather than Hindi's. It was the Devanagari
   half of the same editorial pairing Fraunces led, and it went for the same
   reason: it is a book face, and it read as one at 24px over a map. Poppins
   now carries Marathi at every size. `--font-marathi` survives as its own
   token so a display face can be dropped back in without touching a
   component. */

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
  /* The page's own ground, so a mobile browser's chrome continues the lavender
     wash rather than bracketing it. Keep in step with `--color-canvas`. */
  themeColor: "#e7e7f8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="mr"
      className={`${manrope.variable} ${poppins.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
