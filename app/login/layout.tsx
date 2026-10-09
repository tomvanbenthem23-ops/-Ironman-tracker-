import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inloggen',
  description:
    'Log in met het gedeelde wachtwoord om de trainingstracker van Tom en Quirijn voor de Ironman 70.3 Valencia te openen.'
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
