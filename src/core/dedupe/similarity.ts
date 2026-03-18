import { normalizeForSearch } from "../extraction/feature-parser.js";

function bigrams(input: string): string[] {
  if (input.length < 2) {
    return [input];
  }

  const result: string[] = [];
  for (let index = 0; index < input.length - 1; index += 1) {
    result.push(input.slice(index, index + 2));
  }

  return result;
}

export function compareTextSimilarity(left?: string | null, right?: string | null): number {
  const a = normalizeForSearch(left ?? "");
  const b = normalizeForSearch(right ?? "");

  if (!a && !b) {
    return 1;
  }

  if (!a || !b) {
    return 0;
  }

  const leftBigrams = bigrams(a);
  const rightBigrams = bigrams(b);
  const rightCounts = new Map<string, number>();

  for (const token of rightBigrams) {
    rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);
  }

  let intersection = 0;
  for (const token of leftBigrams) {
    const remaining = rightCounts.get(token) ?? 0;
    if (remaining > 0) {
      intersection += 1;
      rightCounts.set(token, remaining - 1);
    }
  }

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
}
