import type { IndexSeries } from "@/types/indices";
import { IndexChartsSectionClient } from "./IndexChartsSectionClient";

export function IndexChartsSection({
  kospi,
  kosdaq,
}: {
  kospi: IndexSeries;
  kosdaq: IndexSeries;
}) {
  return <IndexChartsSectionClient kospi={kospi} kosdaq={kosdaq} />;
}
