import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { NavbarWrapper } from "./components/NavbarWrapper";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Gogi Eats",
  description:
    "Plataforma local para descubrir negocios cercanos y pedir comida a domicilio con una experiencia simple y confiable",
  icons: [
    {
      rel: "icon",
      url: "/LOGO-NEW2.jpg",
    },
    {
      rel: "apple-touch-icon",
      url: "/LOGO-NEW2.jpg",
    },
  ],
};

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${manrope.variable} ${spaceGrotesk.variable} ${manrope.className} min-h-screen bg-[#F7F1E8] text-foreground`}
      >
        <Providers>
          <div className="flex min-h-screen flex-col">
            <NavbarWrapper />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
