import { checkHasSession } from "./actions";
import LandingPageClient from "@/src/components/LandingPageClient";

export default async function LandingPage() {
  const isLogged = await checkHasSession();

  return <LandingPageClient initialIsLogged={isLogged} />;
}
