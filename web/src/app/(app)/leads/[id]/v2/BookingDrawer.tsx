"use client";

import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import type { BookingKind } from "@/lib/booking/priority";
import { BookingPanel } from "../booking/BookingPanel";
import s from "./lead2.module.css";

// The one place a time is booked. Full screen on the phone (Drawer option), a right sheet on desktop.
export function BookingDrawer({ open, kind, leadId, leadOpen, onClose, onBooked }: {
  open: boolean;
  kind: BookingKind;
  leadId: number;
  leadOpen: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  return (
    <Drawer isOpen={open} onOpenChange={(o) => !o && onClose()} label="Időpont foglalása" width={720} experimental={{ isFullWidthOnMobile: true }}>
      <DrawerHeader title={/* PROPOSAL copy */ "Időpont foglalása"} onOpenChange={(o) => !o && onClose()} />
      <div className={s.sheet}>
        {open && <BookingPanel key={kind} leadId={leadId} leadOpen={leadOpen} initialKind={kind} onBooked={onBooked} />}
      </div>
    </Drawer>
  );
}
