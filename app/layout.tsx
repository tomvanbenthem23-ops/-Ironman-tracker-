import './globals.css';

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Trainingstracker | Ironman 70.3 Valencia',
    template: '%s | Ironman 70.3 Valencia'
  },
  description:
    'Trainingstracker van Tom en Quirijn richting de halve Ironman van Valencia op 18 april 2027: agenda met weekadvies en voorschriften, en een eindtijdvoorspelling.',
  applicationName: 'Ironman 70.3 Valencia',
  // privé-app achter een wachtwoord: niet in zoekmachines
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' }
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' }
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#16222f'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className="flex min-h-screen w-full flex-col bg-im-bg text-im-ink">
        {children}
      </body>
    </html>
  );
}
