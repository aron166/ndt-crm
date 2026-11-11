import { ImportWizard } from "./ImportWizard";
import { PageHeader } from "@/components/astryx/PageHeader";

export const metadata = { title: "Importálás: Helm CRM" };

export default function ImportPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Importálás"
        help="Cégek vagy személyek feltöltése Excel / CSV fájlból. A meglévő rekordokat adószám és név alapján felismeri: nem hoz létre duplikátumot."
      />
      <ImportWizard />
    </div>
  );
}
