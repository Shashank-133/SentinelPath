import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SentinelPath AI — Safety-Focused College Navigation",
  description: "A smart routing system that calculates safety scores (0-100) for paths using NCRB crime baselines, peer incident reports, and emergency proximity.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link 
          rel="stylesheet" 
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

