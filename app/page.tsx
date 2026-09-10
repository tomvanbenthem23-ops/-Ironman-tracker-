'use client';

import { StoreProvider } from '@/lib/store';
import { Shell } from './ui/shell';

export default function Home() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
