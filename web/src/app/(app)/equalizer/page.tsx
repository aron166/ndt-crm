import { EqualizerClient } from "./EqualizerClient";

export const metadata = { title: "Equalizer — Helm CRM" };

// Internal revenue-mix planning tool. No DB, no tenant data — pure client-side
// math (the per-unit economics are user inputs). See backlog-bvq Round 2 #5.
export default function EqualizerPage() {
  return (
    <div className="mount">
      <div className="page-head">
        <div>
          <h1 className="page-title">Equalizer</h1>
          <p style={{ color: "var(--fg-mute)", fontSize: 13, marginTop: 4 }}>
            Bevételi mix tervező — állíts be egy célt, és nézd meg, milyen
            kombinációk hozzák ki. Belső eszköz.
          </p>
        </div>
      </div>
      <EqualizerClient />
    </div>
  );
}
