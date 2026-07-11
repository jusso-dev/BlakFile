import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlakFile",
  description: "Secure, AI-native enterprise file platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen font-sans antialiased [font-family:ui-sans-serif,system-ui,-apple-system,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]">
        {children}
      </body>
    </html>
  );
}
