import type { SearchProfile } from "../config/search-profile.js";
import type { NotificationEvent } from "../domain/property.js";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(input: string): string {
  return escapeHtml(input)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) {
    return "N/D";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function resolveEventLabel(event: NotificationEvent): string {
  switch (event.type) {
    case "initial":
      return "Imóvel atual";
    case "new_listing":
      return "Novo imóvel";
    case "price_drop":
      return "Queda de preço";
    case "updated":
      return "Mudança relevante";
    default:
      return "Imóvel";
  }
}

export function buildTelegramMessage(input: {
  profile: SearchProfile;
  event: NotificationEvent;
}): string {
  const { profile, event } = input;
  const property = event.property;
  const lines: string[] = [];

  lines.push(`<b>${escapeHtml(resolveEventLabel(event))}</b>`);
  lines.push(`<b>${escapeHtml(property.title)}</b>`);

  if (profile.notification.include_source_name) {
    lines.push(`Fonte: ${escapeHtml(property.source_name)}`);
  }

  if (profile.notification.include_price) {
    lines.push(`Preço: ${escapeHtml(formatCurrency(property.price_brl))}`);
  }

  if (property.neighborhood || property.city) {
    lines.push(
      `Local: ${escapeHtml([property.neighborhood, property.city, property.state].filter(Boolean).join(" - "))}`
    );
  }

  const specs = [
    property.bedrooms ? `${property.bedrooms} quartos` : null,
    property.suites ? `${property.suites} suítes` : null,
    property.bathrooms ? `${property.bathrooms} banheiros` : null,
    property.parking_spaces ? `${property.parking_spaces} vagas` : null
  ].filter(Boolean);

  if (specs.length > 0) {
    lines.push(`Specs: ${escapeHtml(specs.join(" | "))}`);
  }

  if (profile.notification.include_main_features && property.features.length > 0) {
    lines.push(`Destaques: ${escapeHtml(property.features.slice(0, 6).join(", "))}`);
  }

  if (profile.notification.include_score) {
    lines.push(`Score: ${event.score}`);
  }

  if (event.type === "price_drop" && event.previousPriceBrl && event.currentPriceBrl) {
    lines.push(
      `Antes: ${escapeHtml(formatCurrency(event.previousPriceBrl))} -> Agora: ${escapeHtml(formatCurrency(event.currentPriceBrl))}`
    );
  }

  if (event.type === "updated" && event.changedFields && event.changedFields.length > 0) {
    lines.push(`Mudanças: ${escapeHtml(event.changedFields.slice(0, 4).join(", "))}`);
  }

  if (event.type === "updated" && event.descriptionSimilarity !== null && event.descriptionSimilarity !== undefined) {
    lines.push(`Similaridade da descrição: ${(event.descriptionSimilarity * 100).toFixed(1)}%`);
  }

  const topReasons = event.scoreReasons.slice(0, 4);
  if (topReasons.length > 0) {
    lines.push(`Sinais: ${escapeHtml(topReasons.join(", "))}`);
  }

  if (profile.notification.include_link) {
    lines.push(`<a href="${escapeHtmlAttribute(property.canonical_url)}">Abrir anúncio</a>`);
  }

  return lines.join("\n");
}
