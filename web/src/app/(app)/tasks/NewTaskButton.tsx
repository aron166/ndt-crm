"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskModal } from "./TaskModal";

export function NewTaskButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
      >
        <Plus className="size-4" />
        Új feladat
      </Button>
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
