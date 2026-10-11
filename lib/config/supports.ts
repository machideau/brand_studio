/**
 * lib/config/supports.ts — Support templates & configuration
 *
 * Defines the dimensions, margins, safe zones, and rules for the 5 MVP supports:
 *  - avatar carré (1:1)
 *  - bannière horizontale
 *  - carte de visite recto (print ready)
 *  - publication carrée réseaux sociaux (1:1)
 *  - publication verticale réseaux sociaux (9:16)
 *
 * Requirements: 14.1, 14.2
 */

export interface SupportMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SupportTemplate {
  id: string;
  label: string;
  widthPx: number;
  heightPx: number;
  margins: SupportMargins;
  safeZone: number; // minimum px padding around the logo
  logoMaxWidthRatio: number; // max proportion of container width the logo may occupy
  printReady: boolean;
}

export const SUPPORT_TEMPLATES: Record<string, SupportTemplate> = {
  avatar: {
    id: "avatar",
    label: "Avatar carré",
    widthPx: 500,
    heightPx: 500,
    margins: { top: 40, right: 40, bottom: 40, left: 40 },
    safeZone: 32,
    logoMaxWidthRatio: 0.65,
    printReady: false,
  },
  bannière: {
    id: "bannière",
    label: "Bannière horizontale",
    widthPx: 1200,
    heightPx: 630,
    margins: { top: 60, right: 80, bottom: 60, left: 80 },
    safeZone: 40,
    logoMaxWidthRatio: 0.4,
    printReady: false,
  },
  carte_de_visite: {
    id: "carte_de_visite",
    label: "Carte de visite (recto)",
    widthPx: 1050,
    heightPx: 600,
    margins: { top: 50, right: 60, bottom: 50, left: 60 },
    safeZone: 32,
    logoMaxWidthRatio: 0.45,
    printReady: true,
  },
  publication_carrée: {
    id: "publication_carrée",
    label: "Publication carrée",
    widthPx: 1080,
    heightPx: 1080,
    margins: { top: 80, right: 80, bottom: 80, left: 80 },
    safeZone: 48,
    logoMaxWidthRatio: 0.5,
    printReady: false,
  },
  publication_verticale: {
    id: "publication_verticale",
    label: "Publication verticale",
    widthPx: 1080,
    heightPx: 1920,
    margins: { top: 150, right: 80, bottom: 150, left: 80 },
    safeZone: 48,
    logoMaxWidthRatio: 0.55,
    printReady: false,
  },
};

/**
 * Normalise any alias to the canonical support template id.
 */
export function normalizeSupportId(id: string): string {
  const clean = id.toLowerCase().replace(/[\s-]/g, "_");
  if (clean === "banner") return "bannière";
  if (clean === "business_card" || clean === "card") return "carte_de_visite";
  if (clean === "post_square" || clean === "square") return "publication_carrée";
  if (clean === "post_vertical" || clean === "vertical" || clean === "story")
    return "publication_verticale";
  return clean;
}

/**
 * Retrieve the template definition for a support.
 * Throws an Error if the support type is unknown.
 */
export function getSupportTemplate(supportType: string): SupportTemplate {
  const canonicalId = normalizeSupportId(supportType);
  const template = SUPPORT_TEMPLATES[canonicalId];
  if (!template) {
    throw new Error(`Unknown support type: "${supportType}"`);
  }
  return template;
}
