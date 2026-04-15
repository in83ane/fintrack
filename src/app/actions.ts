"use server";

import { cookies } from "next/headers";

export async function checkHasSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  return !!session;
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.set("session", "", { path: "/", maxAge: 0, expires: new Date(0) });
  cookieStore.set("refresh_token", "", { path: "/", maxAge: 0, expires: new Date(0) });
  
  return { success: true };
}
