import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavbarWrapper } from "./components/NavbarWrapper";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Gogi Eats",
  description:
    "Plataforma naranja y cercana para pedir comida local a domicilio",
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

const inter = Inter({ subsets: ["latin"], display: "swap" });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${inter.className} min-h-screen bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_45%,#ffedd5_100%)] text-foreground`}
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
