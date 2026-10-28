"use client";
import { RouteLoading } from '@/src/components/RouteLoading';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <RouteLoading failed retry={reset}/>;
}
