import { describe, expect, it } from "vitest";
import { FixedIntervalRateLimiter } from "../../src/core/notifications/rate-limiter.js";

describe("FixedIntervalRateLimiter", () => {
  it("reserva no máximo 10 envios por minuto com intervalo fixo de 6 segundos", () => {
    const limiter = new FixedIntervalRateLimiter(6_000);
    const schedule = Array.from({ length: 10 }, () => limiter.reserve(0));

    expect(schedule).toEqual([0, 6_000, 12_000, 18_000, 24_000, 30_000, 36_000, 42_000, 48_000, 54_000]);
  });
});
