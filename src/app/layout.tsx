import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "CheckMates — Share the meal. Split the bill.", description: "Read your receipt privately in your browser, choose who shared each dish, and split every cent fairly." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
