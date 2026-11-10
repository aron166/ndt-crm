import type { TechnologyWordCount } from "@/lib/leads/technology-words";
import k from "@/components/astryx/page.module.css";
import m from "./setup.module.css";

// Read-only counts view, no interactivity, so this is a plain server-rendered
// component (unlike ScriptVariantsClient, which needs "use client" for its
// editable textarea + save button).
export function TechnologyWordsClient({ words }: { words: TechnologyWordCount[] }) {
  return (
    <section className={k.section}>
      <h2 className={k.h2}>Ügyfél szavai a technológiára</h2>
      {words.length === 0 ? (
        <p className={k.muted}>Még nincs rögzített szó.</p>
      ) : (
        <div className={k.tableWrap}>
          <table className={`${k.table} ${m.numTable}`}>
            <thead>
              <tr>
                <th>Szó</th>
                <th>Hányszor</th>
                <th>Utoljára</th>
              </tr>
            </thead>
            <tbody>
              {words.map((w) => (
                <tr key={w.word}>
                  <td>{w.word}</td>
                  <td>{w.count}</td>
                  <td>
                    {w.lastUsedAt ? new Date(w.lastUsedAt).toLocaleDateString("hu-HU") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
