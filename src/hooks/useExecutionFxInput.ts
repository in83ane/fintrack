'use client';
import { useState } from 'react';
import { useFxRate } from './useFxRate';

/** Suggest the shared quote until edited. Never updates a recorded execution. */
export function useExecutionFxInput(): [string, (value: string) => void] {
  const fx = useFxRate();
  const [edited, setEdited] = useState<string | null>(null);
  return [edited ?? fx.rate ?? '', setEdited];
}
