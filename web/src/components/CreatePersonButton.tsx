"use client";

import { useState } from "react";
import { CreatePersonModal } from "@/components/CreatePersonModal";

export function CreatePersonButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CreatePersonModal open={open} onClose={() => setOpen(false)} />
      <button className="btn primary" onClick={() => setOpen(true)}>+ Új személy</button>
    </>
  );
}
