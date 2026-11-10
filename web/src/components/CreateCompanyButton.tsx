"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateCompanyModal } from "@/components/CreateCompanyModal";

export function CreateCompanyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CreateCompanyModal open={open} onClose={() => setOpen(false)} />
      <Button type="button" onClick={() => setOpen(true)}>+ Új cég</Button>
    </>
  );
}
