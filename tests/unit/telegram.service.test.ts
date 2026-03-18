import { describe, expect, it, vi } from "vitest";
import { TelegramService } from "../../src/core/notifications/telegram.service.js";
import { createTestProfile } from "./helpers/fixtures.js";
import { createTestEnv } from "./helpers/test-env.js";

describe("TelegramService", () => {
  it("faz fallback de sendPhoto para sendMessage quando a imagem falha", async () => {
    const httpClient = {
      post: vi
        .fn()
        .mockRejectedValueOnce({
          response: {
            statusCode: 400,
            body: {
              ok: false,
              description: "wrong file identifier/HTTP URL specified"
            }
          }
        })
        .mockResolvedValueOnce({
          body: {
            ok: true,
            result: {
              message_id: 123
            }
          }
        })
    };

    const service = new TelegramService(
      createTestEnv({
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat"
      }),
      createTestProfile(),
      { warn: vi.fn() } as any,
      httpClient as any
    );
    const result = await service.sendQueuedNotification({
      propertyId: 1,
      sourceId: "test-source",
      event: {
        type: "new_listing",
        fingerprint: "fp-1",
        score: 80,
        scoreReasons: ["keyword:+30:alto padrão"],
        snapshotHash: "snapshot-1",
        property: {
          source_id: "test-source",
          source_name: "Fonte Teste",
          external_id: "prop-1",
          canonical_url: "https://example.com/imovel/1",
          title: "Casa de alto padrão",
          transaction_type: "rent",
          property_type: "casa",
          usage_type: "residential",
          city: "Santo Antônio da Platina",
          state: "PR",
          neighborhood: "Centro",
          address: "Rua Exemplo",
          price_brl: 6000,
          condo_fee_brl: null,
          iptu_brl: null,
          bedrooms: 4,
          suites: 2,
          bathrooms: 4,
          parking_spaces: 2,
          area_built_m2: 200,
          area_total_m2: 300,
          main_image_url: "https://example.com/image.jpg",
          image_urls: ["https://example.com/image.jpg"],
          description: "Casa moderna.",
          features: ["pool"],
          raw_payload: {},
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          is_active: true
        }
      }
    });

    expect(result).toEqual({
      method: "sendMessage",
      messageId: "123"
    });
    expect(httpClient.post).toHaveBeenCalledTimes(2);
    expect(httpClient.post.mock.calls[0]?.[0]).toContain("/sendPhoto");
    expect(httpClient.post.mock.calls[1]?.[0]).toContain("/sendMessage");
  });
});
