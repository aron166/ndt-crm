import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "Importálás — Helm CRM" };

export default function ImportPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)" }}>
          Importálás
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Cégek vagy személyek feltöltése Excel / CSV fájlból. A meglévő rekordokat
          adószám és név alapján felismeri — nem hoz létre duplikátumot.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
