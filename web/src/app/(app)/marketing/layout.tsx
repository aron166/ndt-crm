import type { ReactNode } from "react";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AssistantLauncher />
    </>
  );
}
