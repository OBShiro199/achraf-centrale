import type { Metadata } from "next";
import { Caveat, Geist, Outfit } from "next/font/google";
import { PencilDefs } from "@/components/sketch/defs";
import { SITE_URL } from "@/lib/supabase/config";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["500", "600", "700"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Centrale: bulk VC applications, one platform",
  description:
    "Centrale reads your website, builds your startup profile, matches you with investors and sends from an inbox that is live the moment you sign up.",
  openGraph: { images: ["/brand/banner.png"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${outfit.variable} ${caveat.variable} antialiased`}>
      <body className="min-h-dvh">
        <PencilDefs />
        {children}
      </body>
    </html>
  );
}
