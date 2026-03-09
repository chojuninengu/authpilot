import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuthPilot — AI Prior Authorization",
  description: "AI-powered Prior Authorization agent built on MCP + A2A + FHIR R4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
