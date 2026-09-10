import type { Metadata } from "next"
import { NotificationProvider } from "./components/NotificationContext"
import { AlertEngineWrapper } from "./components/AlertEngineWrapper"
import "./globals.css"

export const metadata: Metadata = {
  title: "Bharat Energy AI",
  description: "NILM-powered energy intelligence platform",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>
          <AlertEngineWrapper />
          <GlobalNav />
          <main>{children}</main>
        </NotificationProvider>
      </body>
    </html>
  )
}

// ─── Persistent top nav (shown on all pages) ──────────────
// This is a server component wrapper — bell is client-only
import { GlobalNav } from "./components/GlobalNav"