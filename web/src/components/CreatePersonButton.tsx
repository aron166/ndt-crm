"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreatePersonModal } from "@/components/CreatePersonModal";

export function CreatePersonButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CreatePersonModal open={open} onClose={() => setOpen(false)} />
      <Button type="button" onClick={() => setOpen(true)}>+ Új személy</Button>
    </>
  );
}
