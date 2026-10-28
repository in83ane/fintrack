import React from 'react';
import { RouteContent } from '@/src/components/RouteContent';

/** PageTransition is the single owner of route motion. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <RouteContent>{children}</RouteContent>;
}
