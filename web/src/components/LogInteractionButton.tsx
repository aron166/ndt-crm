"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogInteractionModal } from "./LogInteractionModal";

interface LogInteractionButtonProps {
  companyId?: number | null;
  personId?: number | null;
  companyName?: string;
  personName?: string;
}

export function LogInteractionButton({
  companyId,
  personId,
  companyName,
  personName,
}: LogInteractionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-green-600 hover:bg-green-700 text-white gap-2"
      >
        <Phone className="size-4" />
        Naplózás
      </Button>
      <LogInteractionModal
        open={open}
        onClose={() => {
          setOpen(false);
          router.refresh();
        }}
        companyId={companyId}
        personId={personId}
        companyName={companyName}
        personName={personName}
      />
    </>
  );
}
