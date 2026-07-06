import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import NavLink from "@/components/NavLink";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Order Supervisor | Temporal + Groq",
  description: "AI-powered long-running order lifecycle supervisor using Temporal workflows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen antialiased selection:bg-blue-500/30 selection:text-blue-200`}>
        {/* Ambient background glows */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

        <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight text-white group">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 text-white font-black shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
                    ⚡
                  </div>
                  <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Order Supervisor</span>
                </Link>
                <div className="flex items-center gap-1.5">
                  <NavLink href="/supervisors">Supervisors</NavLink>
                  <NavLink href="/runs">Runs</NavLink>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900/60 border border-gray-800/80 text-xs text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse shadow-sm shadow-green-500" />
                  <span>Temporal Daemon Active</span>
                </div>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          {children}
        </main>
      </body>
    </html>
  );
}
