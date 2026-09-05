import "@xterm/xterm/css/xterm.css";
import type { ReactNode } from "react";
import { IdeThemeProvider } from "@/lib/ide/theme";

export default function IdeLayout({ children }: { children: ReactNode }) {
  return <IdeThemeProvider>{children}</IdeThemeProvider>;
}
