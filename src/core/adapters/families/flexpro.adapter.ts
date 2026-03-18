import type { CrawlResult } from "../../domain/property.js";
import type { CrawlOptions } from "../base/base-source-adapter.js";
import { BaseBrowserAdapter } from "../base/base-browser-adapter.js";

export class FlexproAdapter extends BaseBrowserAdapter {
  protected override async collectRecords(options: CrawlOptions): Promise<CrawlResult> {
    const result = await super.collectRecords(options);
    const mustContain = this.getHintArray(["validation_rules", "must_contain_any"]).map((value) => value.toLowerCase());
    const rejectTerms = this.getHintArray(["validation_rules", "reject_if_contains_any"]).map((value) => value.toLowerCase());

    const combinedText = result.properties
      .map((property) => `${property.title ?? ""} ${property.description ?? ""} ${property.address ?? ""} ${property.neighborhood ?? ""}`)
      .join(" ")
      .toLowerCase();

    const hasRequiredContent = mustContain.length === 0 || mustContain.some((term) => combinedText.includes(term));
    const hasRejectedContent = rejectTerms.some((term) => combinedText.includes(term));

    if (!hasRequiredContent || hasRejectedContent) {
      return {
        ...result,
        properties: [],
        warnings: [
          ...result.warnings,
          !hasRequiredContent ? "validation_failed:required_branch_content_missing" : "",
          hasRejectedContent ? "validation_failed:rejected_branch_terms_detected" : ""
        ].filter(Boolean)
      };
    }

    return result;
  }
}
