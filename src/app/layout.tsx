import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PlayTonight - Trouvez vos jeux en commun',
  description: 'Entrez vos profils Steam et découvrez immédiatement les jeux multijoueurs que vous possédez tous pour jouer ce soir.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className={`${outfit.className} min-h-full flex flex-col bg-[#f0f1f4] text-[#111827]`}>
        {children}
      </body>
    </html>
  );
}
