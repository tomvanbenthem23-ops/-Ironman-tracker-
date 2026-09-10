import './globals.css';

import { Analytics } from '@vercel/analytics/react';

export const metadata = {
  title: 'Ironman 70.3 Valencia — Tom & Quirijn',
  description:
    'Trainingstracker richting de halve Ironman van Valencia, 18 april 2027. Agenda met weektargets en een dashboard met eindtijdvoorspelling.'
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
      <Analytics />
    </html>
  );
}
