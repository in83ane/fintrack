"use client";

import React from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="ft-route ft-page">{children}</div>;
}
