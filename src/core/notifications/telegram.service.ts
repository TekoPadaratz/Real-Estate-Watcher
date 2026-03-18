import got from "got";
import type { Logger } from "pino";
import type { AppEnv } from "../config/env.js";
import type { SearchProfile } from "../config/search-profile.js";
import type { QueuedNotificationPayload } from "../domain/property.js";
import { buildTelegramMessage } from "./message-builder.js";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;

export type TelegramDeliveryErrorKind = "rate_limit" | "temporary" | "permanent";

export interface TelegramHttpClient {
  post: (url: string, options: Record<string, unknown>) => Promise<unknown>;
}

export interface TelegramSendResult {
  method: "sendPhoto" | "sendMessage";
  messageId?: string | null;
}

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
  result?: {
    message_id?: number;
  };
}

export class TelegramDeliveryError extends Error {
  constructor(
    message: string,
    public readonly kind: TelegramDeliveryErrorKind,
    public readonly retryAfterMs?: number,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "TelegramDeliveryError";
  }
}

function truncateTelegramText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function readErrorBody(error: unknown): TelegramApiResponse | null {
  const candidate = error as {
    response?: {
      body?: unknown;
      statusCode?: number;
    };
  };

  const body = candidate.response?.body;
  if (!body) {
    return null;
  }

  if (typeof body === "object") {
    return body as TelegramApiResponse;
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body) as TelegramApiResponse;
    } catch {
      return null;
    }
  }

  return null;
}

function readStatusCode(error: unknown): number | undefined {
  const candidate = error as {
    response?: {
      statusCode?: number;
    };
    code?: string;
  };

  if (typeof candidate.response?.statusCode === "number") {
    return candidate.response.statusCode;
  }

  if (candidate.code === "ETIMEDOUT" || candidate.code === "ECONNRESET" || candidate.code === "ENOTFOUND") {
    return 503;
  }

  return undefined;
}

function classifyTelegramError(error: unknown): TelegramDeliveryError {
  if (error instanceof TelegramDeliveryError) {
    return error;
  }

  const body = readErrorBody(error);
  const statusCode = readStatusCode(error);
  const description = body?.description ?? (error instanceof Error ? error.message : String(error));
  const retryAfterSeconds = body?.parameters?.retry_after;

  if (statusCode === 429 || typeof retryAfterSeconds === "number") {
    return new TelegramDeliveryError(description, "rate_limit", (retryAfterSeconds ?? 1) * 1000, statusCode);
  }

  if (statusCode && statusCode >= 500) {
    return new TelegramDeliveryError(description, "temporary", undefined, statusCode);
  }

  if ((error as { code?: string }).code && !statusCode) {
    return new TelegramDeliveryError(description, "temporary", undefined, statusCode);
  }

  return new TelegramDeliveryError(description, "permanent", undefined, statusCode);
}

function shouldFallbackToMessage(error: TelegramDeliveryError): boolean {
  if (error.kind === "rate_limit") {
    return false;
  }

  return true;
}

function extractTelegramBody(response: unknown): TelegramApiResponse {
  const body =
    (response as { body?: TelegramApiResponse }).body ??
    (response as TelegramApiResponse);

  if (!body || body.ok === false) {
    throw classifyTelegramError({
      response: {
        body
      }
    });
  }

  return body;
}

export class TelegramService {
  private readonly httpClient: TelegramHttpClient;

  constructor(
    private readonly env: AppEnv,
    private readonly profile: SearchProfile,
    private readonly logger: Logger,
    httpClient?: TelegramHttpClient
  ) {
    this.httpClient = httpClient ?? {
      post: async (url, options) =>
        got.post(url, {
          ...options,
          responseType: "json",
          timeout: {
            request: this.env.HTTP_TIMEOUT_MS
          }
        })
    };
  }

  isConfigured(): boolean {
    return Boolean(this.env.TELEGRAM_BOT_TOKEN && this.env.TELEGRAM_CHAT_ID);
  }

  private get baseUrl(): string {
    return `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}`;
  }

  private async sendPhoto(payload: QueuedNotificationPayload, caption: string): Promise<TelegramSendResult> {
    try {
      const response = await this.httpClient.post(`${this.baseUrl}/sendPhoto`, {
        json: {
          chat_id: this.env.TELEGRAM_CHAT_ID,
          photo: payload.event.property.main_image_url,
          caption: truncateTelegramText(caption, TELEGRAM_CAPTION_LIMIT),
          parse_mode: "HTML",
          disable_web_page_preview: false
        }
      });
      const body = extractTelegramBody(response);

      return {
        method: "sendPhoto",
        messageId: body.result?.message_id ? String(body.result.message_id) : null
      };
    } catch (error) {
      throw classifyTelegramError(error);
    }
  }

  private async sendMessage(payload: QueuedNotificationPayload, caption: string): Promise<TelegramSendResult> {
    try {
      const response = await this.httpClient.post(`${this.baseUrl}/sendMessage`, {
        json: {
          chat_id: this.env.TELEGRAM_CHAT_ID,
          text: truncateTelegramText(caption, TELEGRAM_MESSAGE_LIMIT),
          parse_mode: "HTML",
          disable_web_page_preview: false
        }
      });
      const body = extractTelegramBody(response);

      return {
        method: "sendMessage",
        messageId: body.result?.message_id ? String(body.result.message_id) : null
      };
    } catch (error) {
      throw classifyTelegramError(error);
    }
  }

  async sendQueuedNotification(payload: QueuedNotificationPayload): Promise<TelegramSendResult> {
    if (!this.isConfigured()) {
      throw new TelegramDeliveryError(
        "Telegram não configurado. Preencha TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.",
        "permanent"
      );
    }

    const caption = buildTelegramMessage({
      profile: this.profile,
      event: payload.event
    });

    if (this.profile.notification.include_main_photo && payload.event.property.main_image_url) {
      try {
        return await this.sendPhoto(payload, caption);
      } catch (error) {
        const classified = classifyTelegramError(error);
        if (!shouldFallbackToMessage(classified)) {
          throw classified;
        }

        this.logger.warn(
          {
            err: classified,
            propertyId: payload.propertyId,
            eventType: payload.event.type
          },
          "Falha ao enviar foto no Telegram. Aplicando fallback para sendMessage."
        );
      }
    }

    return this.sendMessage(payload, caption);
  }

  async sendTestMessage(): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error("Telegram não configurado. Preencha TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.");
    }

    await this.sendMessage(
      {
        propertyId: 0,
        sourceId: "system",
        event: {
          type: "updated",
          property: {
            source_id: "system",
            source_name: "real-estate-watcher",
            external_id: "notify-test",
            canonical_url: "https://example.com/notify-test",
            title: "real-estate-watcher: teste de notificação OK",
            transaction_type: "system",
            property_type: "system",
            usage_type: "system",
            city: null,
            state: null,
            neighborhood: null,
            address: null,
            price_brl: null,
            condo_fee_brl: null,
            iptu_brl: null,
            bedrooms: null,
            suites: null,
            bathrooms: null,
            parking_spaces: null,
            area_built_m2: null,
            area_total_m2: null,
            main_image_url: null,
            image_urls: [],
            description: null,
            features: [],
            raw_payload: {},
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            is_active: true
          },
          fingerprint: "notify-test",
          score: 0,
          scoreReasons: [],
          snapshotHash: "notify-test"
        }
      },
      "real-estate-watcher: teste de notificação OK"
    );
  }
}
