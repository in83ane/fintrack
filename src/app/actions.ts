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
}

export async function getSessionTokensAction() {
  const cookieStore = await cookies();
  const access_token = cookieStore.get("session")?.value;
  const refresh_token = cookieStore.get("refresh_token")?.value;
  
  if (access_token) {
    return { access_token, refresh_token: refresh_token || "" };
  }
  return null;
}
