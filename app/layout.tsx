import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono, Manrope } from "next/font/google";
import PwaRegister from "./pwa-register";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hello",
  description:
    "A voice-first, image-assisted English learning app for newcomers practicing everyday conversations.",
  applicationName: "Hello",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.svg", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Hello",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5efe2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
      >
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
