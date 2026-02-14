import React from 'react';
import Header from '../components/Header';
import "./globals.css";

export const metadata = {
  title: 'Worker Productivity Dashboard',
  description: 'Dashboard for AI-powered worker productivity (sample)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900 bg-slate-900">
        <Header />
        <main className="container mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}