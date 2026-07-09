import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PlayTonight',
  description: 'Trouvez le jeu parfait pour votre session de ce soir.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className={`${inter.className} min-h-full flex flex-col bg-[#f0f1f4] text-[#111827]`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
