import { describe, expect, it } from "vitest";
import { parseAreaM2, parseBrlValue, parseInteger } from "../../src/core/extraction/price-parser.js";

describe("price-parser", () => {
  it("converte preço em BRL para número", () => {
    expect(parseBrlValue("R$ 6.600,00 /mês")).toBe(6600);
  });

  it("converte área textual para número", () => {
    expect(parseAreaM2("184,35m²")).toBe(184.35);
    expect(parseAreaM2("3480,00 m²")).toBe(3480);
  });

  it("extrai inteiros de textos livres", () => {
    expect(parseInteger("4 vagas")).toBe(4);
  });

  it("aceita números sem separador de milhar no fallback monetário", () => {
    expect(parseBrlValue("7500,00")).toBe(7500);
  });
});
