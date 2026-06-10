"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SendEmailModal } from "./SendEmailModal";

interface SendEmailButtonProps {
  companyId?: number | null;
  personId?: number | null;
  defaultTo?: string;
  contextLabel?: string;
  variant?: "primary" | "ghost";
}

export function SendEmailButton({
  companyId, personId, defaultTo, contextLabel, variant = "ghost",
}: SendEmailButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "primary" ? (
        <Button onClick={() => setOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          <Mail className="size-4" /> Email
        </Button>
      ) : (
        <button className="btn" onClick={() => setOpen(true)}>✉ Email</button>
      )}
      <SendEmailModal
        open={open}
        onClose={() => { setOpen(false); router.refresh(); }}
        companyId={companyId}
        personId={personId}
        defaultTo={defaultTo}
        contextLabel={contextLabel}
      />
    </>
  );
}
