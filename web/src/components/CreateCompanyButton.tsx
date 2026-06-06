"use client";

import { useState } from "react";
import { CreateCompanyModal } from "@/components/CreateCompanyModal";

export function CreateCompanyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} />
      <button className="btn primary" onClick={() => setOpen(true)}>+ Új cég</button>
    </>
  );
}
