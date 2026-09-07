import { getCallQueue, getCallSegments } from "@/app/actions/outreach";
import CallCockpit from "./CallCockpit";

// The queue is live (pipeline status + freshness change as you work it).
export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const [queue, segments] = await Promise.all([getCallQueue(), getCallSegments()]);
  return <CallCockpit initialQueue={queue} segments={segments} />;
}
