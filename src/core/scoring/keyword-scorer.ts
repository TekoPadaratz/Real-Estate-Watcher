import type { SearchProfile } from "../config/search-profile.js";
import { normalizeForSearch } from "../extraction/feature-parser.js";

export interface KeywordScoreResult {
  score: number;
  reasons: string[];
}

export function scoreKeywords(profile: SearchProfile, parts: Array<string | null | undefined>): KeywordScoreResult {
  const haystack = normalizeForSearch(parts.filter(Boolean).join(" "));
  let score = 0;
  const reasons: string[] = [];

  for (const rule of profile.text_rules.positive_keywords) {
    if (haystack.includes(normalizeForSearch(rule.term))) {
      score += rule.weight;
      reasons.push(`keyword:+${rule.weight}:${rule.term}`);
    }
  }

  for (const rule of profile.text_rules.negative_keywords) {
    if (haystack.includes(normalizeForSearch(rule.term))) {
      score += rule.weight;
      reasons.push(`keyword:${rule.weight}:${rule.term}`);
    }
  }

  return { score, reasons };
}
