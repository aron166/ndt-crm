import type { TechnologyWordCount } from "@/lib/leads/technology-words";

// Read-only counts view, no interactivity, so this is a plain server-rendered
// component (unlike ScriptVariantsClient, which needs "use client" for its
// editable textarea + save button).
export function TechnologyWordsClient({ words }: { words: TechnologyWordCount[] }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div className="panel-title">Ügyfél szavai a technológiára</div></div>
      <div className="panel-pad space-y-3">
        {words.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--fg-mute)" }}>Még nincs rögzített szó.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, minWidth: 320 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Szó</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Hányszor</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Utoljára</th>
                </tr>
              </thead>
              <tbody>
                {words.map((w) => (
                  <tr key={w.word} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 8px" }}>{w.word}</td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>{w.count}</td>
                    <td style={{ textAlign: "right", padding: "4px 8px" }}>
                      {w.lastUsedAt ? new Date(w.lastUsedAt).toLocaleDateString("hu-HU") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
