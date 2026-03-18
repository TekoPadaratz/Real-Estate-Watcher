const currencyPattern = /r\$\s*([\d\.\,]+)/i;
const numberPattern = /(\d+(?:\.\d{3})*(?:,\d{1,2})?)/;

export function parseBrlValue(input?: string | number | null): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  const normalized = String(input).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(currencyPattern) ?? normalized.match(numberPattern);
  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function parseAreaM2(input?: string | number | null): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  const match = String(input).match(numberPattern);
  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function parseInteger(input?: string | number | null): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === "number" && Number.isInteger(input)) {
    return input;
  }

  const match = `${input}`.match(/\d+/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[0], 10);
}
