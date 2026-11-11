"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { TaskModal } from "./TaskModal";
import k from "@/components/astryx/page.module.css";

export function NewTaskButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${k.btn} ${k.btnPrimary}`}>
        <Plus className="size-4" />
        Új feladat
      </button>
      <TaskModal
        open={open}
        onClose={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
