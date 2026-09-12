"use client";

import { readDossier, sortDossierItems } from "@/lib/enrichment/dossier";
import { formatDate } from "@/lib/utils";

interface Props {
  enrichment: unknown;
  closenessScore: number | null;
  enrichmentUpdatedAt: string | Date | null;
}

/** Only render a URL as a link when it actually parses as http/https — the
 * dossier is written by an external research agent, treat it as untrusted. */
function safeHttpUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function PersonDossierTab({ enrichment, closenessScore, enrichmentUpdatedAt }: Props) {
  const dossier = readDossier(enrichment);
  const hasContent = !!dossier && (
    (dossier.apropo?.length ?? 0) > 0 ||
    !!dossier.summary ||
    (dossier.items?.length ?? 0) > 0 ||
    (dossier.sources?.length ?? 0) > 0
  );

  return (
    <div className="panel mount" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="h-section" style={{ margin: 0 }}>Kapcsolati pontszám</span>
          <span style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--fg)" }}>
            {closenessScore ?? "—"}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>
          Frissítve: {formatDate(enrichmentUpdatedAt)}
        </span>
      </div>

      {!hasContent ? (
        <p style={{ fontSize: 14, color: "var(--fg-faint)" }}>Ehhez a személyhez még nincs dosszié.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {(dossier!.apropo?.length ?? 0) > 0 && (
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>Apropó</div>
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                {dossier!.apropo!.map((line, i) => (
                  <li key={i} style={{ fontSize: 16, fontWeight: 500, color: "var(--fg)", lineHeight: 1.5 }}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dossier!.summary && (
            <p style={{ fontSize: 14, color: "var(--fg-soft)", lineHeight: 1.6, margin: 0 }}>
              {dossier!.summary}
            </p>
          )}

          {(dossier!.items?.length ?? 0) > 0 && (
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>Előzmények</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sortDossierItems(dossier!.items!).map((item, i) => {
                  const href = safeHttpUrl(item.url);
                  return (
                    <div key={i} style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        {item.date && (
                          <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>
                            {item.date}
                          </span>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{item.title}</span>
                      </div>
                      {item.detail && (
                        <p style={{ fontSize: 13, color: "var(--fg-mute)", margin: "4px 0 0", lineHeight: 1.5 }}>
                          {item.detail}
                        </p>
                      )}
                      {(item.source || href) && (
                        <div style={{ marginTop: 4, fontSize: 12, color: "var(--fg-faint)" }}>
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--indigo)" }}>
                              {item.source || href}
                            </a>
                          ) : (
                            item.source
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(dossier!.sources?.length ?? 0) > 0 && (
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>Forrás</div>
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                {dossier!.sources!.map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: "var(--fg-faint)" }}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
