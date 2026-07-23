import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeTrakr Relay — your Trakt history, mirrored to WeTrakr",
  description:
    "Relay mirrors every finished movie and episode from your Trakt or Nuvio history to your WeTrakr account. No install, no Trakt connection slot used, disconnect anytime.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Poppins:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
