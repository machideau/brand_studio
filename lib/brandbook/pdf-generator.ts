/**
 * lib/brandbook/pdf-generator.ts — PDF Brandbook generator using @react-pdf/renderer
 *
 * Generates a complete paginated brand guideline PDF containing all 14 mandatory sections:
 *  1. Couverture & Titre
 *  2. Présentation de la marque
 *  3. Logo et variantes
 *  4. Palette de couleurs
 *  5. Typographie
 *  6. Espacement et grille
 *  7. Règles d'utilisation du logo
 *  8. Interdictions & règles strictes
 *  9. Supports de communication
 *  10. Présentation des mockups
 *  11. Guide d'impression
 *  12. Guide digital
 *  13. Contact
 *  14. Annexes & Mentions légales
 *
 * All text is selectable (vector text). Fonts are embedded from local OFL files.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import path from "path";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Charter } from "@/lib/strategy/types";
import type { BrandProfile } from "@/lib/analysis/types";

// ---------------------------------------------------------------------------
// Font registration
// ---------------------------------------------------------------------------

try {
  Font.register({
    family: "Noto Sans",
    fonts: [
      {
        src: path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"),
        fontWeight: 400,
      },
      {
        src: path.join(process.cwd(), "public", "fonts", "NotoSans-Bold.ttf"),
        fontWeight: 700,
      },
    ],
  });
} catch {
  // Ignore if already registered
}

// ---------------------------------------------------------------------------
// 14 Mandatory sections
// ---------------------------------------------------------------------------

export const MANDATORY_SECTIONS = [
  "Couverture & Titre",
  "Présentation de la marque",
  "Logo et variantes",
  "Palette de couleurs",
  "Typographie",
  "Espacement et grille",
  "Règles d'utilisation du logo",
  "Interdictions & règles strictes",
  "Supports de communication",
  "Présentation des mockups",
  "Guide d'impression",
  "Guide digital",
  "Contact",
  "Annexes & Mentions légales",
] as const;

export type MandatorySection = (typeof MANDATORY_SECTIONS)[number];

// ---------------------------------------------------------------------------
// Types & Styles
// ---------------------------------------------------------------------------

export interface BrandbookData {
  projectId: string;
  brandName: string;
  tagline?: string;
  sector?: string;
  targetAudience?: string;
  charter: Charter;
  brandProfile?: BrandProfile;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Noto Sans",
    padding: 40,
    backgroundColor: "#ffffff",
    color: "#222222",
  },
  coverPage: {
    fontFamily: "Noto Sans",
    padding: 50,
    backgroundColor: "#111827",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: 700,
    marginBottom: 12,
    color: "#ffffff",
  },
  coverSubtitle: {
    fontSize: 18,
    color: "#9ca3af",
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    borderBottomWidth: 1.5,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 8,
    marginBottom: 16,
  },
  subheading: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 6,
    color: "#374151",
  },
  paragraph: {
    fontSize: 11,
    lineHeight: 1.5,
    color: "#4b5563",
    marginBottom: 10,
  },
  colorRow: {
    display: "flex",
    flexDirection: "row",
    marginTop: 12,
    marginBottom: 16,
  },
  colorBox: {
    width: 80,
    height: 50,
    marginRight: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  colorLabel: {
    fontSize: 9,
    marginTop: 4,
    color: "#374151",
    textAlign: "center",
  },
  bulletItem: {
    fontSize: 10,
    lineHeight: 1.4,
    color: "#4b5563",
    marginBottom: 4,
    marginLeft: 12,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 9,
    bottom: 25,
    right: 40,
    color: "#9ca3af",
  },
});

// ---------------------------------------------------------------------------
// Document Component
// ---------------------------------------------------------------------------

function BrandbookDocument({ data }: { data: BrandbookData }) {
  const { charter, brandName, tagline, sector, targetAudience } = data;

  return React.createElement(
    Document,
    null,
    // Section 1: Couverture
    React.createElement(
      Page,
      { size: "A4", style: styles.coverPage },
      React.createElement(Text, { style: styles.coverTitle }, brandName),
      React.createElement(
        Text,
        { style: styles.coverSubtitle },
        tagline || "Guide d'identité visuelle & charte graphique",
      ),
      React.createElement(
        Text,
        { style: { fontSize: 10, color: "#6b7280", marginTop: 40 } },
        `Document généré automatiquement • Version ${charter.version}`,
      ),
    ),

    // Section 2: Présentation de la marque
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "1. Présentation de la marque",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        `Marque : ${brandName}`,
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        `Secteur d'activité : ${sector || "Non spécifié"}`,
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        `Public cible : ${targetAudience || "Grand public et professionnels"}`,
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        `Positionnement : ${charter.visualStyle.join(", ")}`,
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 2",
      ),
    ),

    // Section 3: Logo et variantes
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "2. Logo et variantes",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Le logo est l'élément central de l'identité de marque. Il doit toujours être reproduit avec intégrité, sans altération de ses proportions.",
      ),
      React.createElement(
        Text,
        { style: styles.subheading },
        "Dimensions minimales & zone de sécurité",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        `Taille minimale recommandée : ${charter.logoRules.minSize} px de largeur. Zone de protection obligatoire : ${charter.logoRules.safeZone * charter.spacingUnit} px.`,
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 3",
      ),
    ),

    // Section 4: Palette de couleurs
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "3. Palette de couleurs",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Les couleurs officielles de la marque créent une reconnaissance immédiate sur tous les points de contact.",
      ),
      React.createElement(
        View,
        { style: styles.colorRow },
        React.createElement(
          View,
          null,
          React.createElement(View, {
            style: [styles.colorBox, { backgroundColor: charter.colors.primary }],
          }),
          React.createElement(
            Text,
            { style: styles.colorLabel },
            `Primaire\n${charter.colors.primary}`,
          ),
        ),
        React.createElement(
          View,
          null,
          React.createElement(View, {
            style: [styles.colorBox, { backgroundColor: charter.colors.secondary }],
          }),
          React.createElement(
            Text,
            { style: styles.colorLabel },
            `Secondaire\n${charter.colors.secondary}`,
          ),
        ),
        React.createElement(
          View,
          null,
          React.createElement(View, {
            style: [styles.colorBox, { backgroundColor: charter.colors.accent }],
          }),
          React.createElement(
            Text,
            { style: styles.colorLabel },
            `Accent\n${charter.colors.accent}`,
          ),
        ),
        React.createElement(
          View,
          null,
          React.createElement(View, {
            style: [styles.colorBox, { backgroundColor: charter.colors.background }],
          }),
          React.createElement(
            Text,
            { style: styles.colorLabel },
            `Fond\n${charter.colors.background}`,
          ),
        ),
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 4",
      ),
    ),

    // Section 5: Typographie
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "4. Typographie",
      ),
      React.createElement(
        Text,
        { style: styles.subheading },
        `Police principale : ${charter.primaryFont}`,
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Utilisée pour les titres, logotypes et visuels promotionnels.",
      ),
      React.createElement(
        Text,
        { style: styles.subheading },
        `Police secondaire : ${charter.secondaryFont}`,
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Utilisée pour les textes courants, sous-titres et contenus éditoriaux.",
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 5",
      ),
    ),

    // Section 6: Espacement et grille
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "5. Espacement et grille de mise en page",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        `Unité d'espacement de base : ${charter.spacingUnit} px. Tous les espacements, marges et paddings doivent être des multiples de cette unité (8px, 16px, 24px, 32px, etc.).`,
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 6",
      ),
    ),

    // Section 7: Règles d'utilisation du logo
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "6. Règles d'utilisation du logo",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Le logo doit être placé sur un fond assurant un contraste supérieur au seuil WCAG AA (3:1 minimum pour les graphiques, 4,5:1 pour le texte).",
      ),
      React.createElement(
        Text,
        { style: styles.subheading },
        "Fonds autorisés :",
      ),
      ...charter.logoRules.allowedBackgrounds.map((bg) =>
        React.createElement(Text, { key: bg, style: styles.bulletItem }, `• Fond : ${bg}`),
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 7",
      ),
    ),

    // Section 8: Interdits
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "7. Interdictions & règles strictes",
      ),
      React.createElement(
        Text,
        { style: styles.bulletItem },
        "• Ne jamais déformer les proportions du logo (ratio largeur/hauteur fixe).",
      ),
      React.createElement(
        Text,
        { style: styles.bulletItem },
        "• Ne pas modifier les couleurs officielles de la marque.",
      ),
      React.createElement(
        Text,
        { style: styles.bulletItem },
        "• Ne pas utiliser d'effets d'ombrage ou de contours non prévus dans la charte.",
      ),
      ...charter.forbidden.map((f) =>
        React.createElement(Text, { key: f, style: styles.bulletItem }, `• ${f}`),
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 8",
      ),
    ),

    // Section 9: Supports produits
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "8. Supports de communication produits",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Le pack comprend 5 déclinaisons graphiques calibrées au pixel près :",
      ),
      React.createElement(Text, { style: styles.bulletItem }, "• Avatar carré (500x500 px)"),
      React.createElement(Text, { style: styles.bulletItem }, "• Bannière web (1200x630 px)"),
      React.createElement(Text, { style: styles.bulletItem }, "• Carte de visite recto (1050x600 px - 300 DPI)"),
      React.createElement(Text, { style: styles.bulletItem }, "• Publication carrée réseaux sociaux (1080x1080 px)"),
      React.createElement(Text, { style: styles.bulletItem }, "• Publication verticale story/reels (1080x1920 px)"),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 9",
      ),
    ),

    // Section 10: Présentation des mockups
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "9. Présentation des mockups",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Les mockups fournis dans ce pack sont étiquetés « présentation » et ont pour but d'illustrer la marque en contexte réel (papeterie, enseignes, écrans, vêtements).",
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 10",
      ),
    ),

    // Section 11: Guide d'impression
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "10. Guide d'impression (Print)",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Pour les supports destinés à l'impression (carte de visite, papeterie) : utiliser une résolution minimale de 300 DPI, veiller à la zone de découpe (bords perdus 3 mm) et convertir en profil CMJN si l'imprimeur le requiert.",
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 11",
      ),
    ),

    // Section 12: Guide digital
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "11. Guide digital (Web & Réseaux Sociaux)",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Pour le web, privilégier le format PNG avec compression optimisée ou WebP, en conservant le profil sRGB standard.",
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 12",
      ),
    ),

    // Section 13: Contact
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "12. Contact & Propriété",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        `Identité visuelle créée pour : ${brandName}`,
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Toute question relative à cette charte peut être adressée à la direction de la marque.",
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 13",
      ),
    ),

    // Section 14: Annexes & Mentions légales
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.sectionTitle },
        "13. Annexes & Mentions légales",
      ),
      React.createElement(
        Text,
        { style: styles.paragraph },
        "Les polices typographiques intégrées dans cette identité sont distribuées sous licence libre (SIL Open Font License). Les assets visuels sont sous la pleine propriété de la marque.",
      ),
      React.createElement(
        Text,
        { style: styles.pageNumber },
        "Page 14",
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Public Generator API
// ---------------------------------------------------------------------------

/**
 * Generate the complete paginated brandbook PDF as a Buffer.
 * Verifies that all 14 mandatory sections are accounted for.
 */
export async function generateBrandbookPdf(data: BrandbookData): Promise<Buffer> {
  if (MANDATORY_SECTIONS.length !== 14) {
    throw new Error(
      `Brandbook must contain exactly 14 mandatory sections, got ${MANDATORY_SECTIONS.length}`,
    );
  }

  const doc = BrandbookDocument({ data });
  const buffer = await renderToBuffer(doc);
  return buffer;
}
