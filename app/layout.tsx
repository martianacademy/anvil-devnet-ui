import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anvil DevNet UI",
  description: "Local blockchain devnet explorer & debugger",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} antialiased min-h-screen bg-background text-foreground`} suppressHydrationWarning>
        <TooltipProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Navbar />
              <main>{children}</main>
              <Footer />
            </ConfirmProvider>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}

