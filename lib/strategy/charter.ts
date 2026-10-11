/**
 * lib/strategy/charter.ts — Brand charter generation via LLM
 *
 * Flow:
 *  1. Check DB for an existing charter (idempotence — Exigence 10.5)
 *  2. Build a detailed prompt from BrandProfile + project data
 *  3. Call chat() from llm-client
 *  4. Parse + validate JSON response with charterSchema (Exigence 10.2)
 *  5. Retry up to env.MAX_RETRIES on parse/validation failure
 *  6. Set version = (existingVersion ?? 0) + 1
 *  7. Persist via saveCharter() (Exigence 10.4)
 *  8. Return the validated Charter
 *
 * Exigences : 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { chat } from '@/lib/ai/llm-client';
import env from '@/lib/config/env';
import { getCharter, saveCharter } from '@/lib/db/queries/charters';
import { log } from '@/lib/logger';
import { charterSchema, type Charter } from '@/lib/strategy/types';
import type { BrandProfile } from '@/lib/analysis/types';

// ─── Input shape ──────────────────────────────────────────────────────────────

export interface ProjectData {
  brandName: string;
  sector: string;
  targetAudience: string;
  positioning: string;
  artDirections: string[];
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build a detailed LLM prompt that incorporates the brand profile and
 * project data. The prompt asks for a strict JSON response only.
 */
function buildPrompt(brandProfile: BrandProfile, projectData: ProjectData): string {
  const { brandName, sector, targetAudience, positioning, artDirections } = projectData;

  const dominantColorList = brandProfile.dominantColors
    .slice(0, 5)
    .map((c) => `${c.hex} (${Math.round(c.proportion * 100)}%)`)
    .join(', ');

  const perceivedStyle =
    brandProfile.perceivedStyle === 'uncertain'
      ? 'non déterminé'
      : brandProfile.perceivedStyle.join(', ');

  const logoType =
    brandProfile.logoType === 'uncertain' ? 'non déterminé' : brandProfile.logoType;

  const artDirList =
    artDirections.length > 0 ? artDirections.join(', ') : 'non spécifié';

  return `Tu es un expert en identité visuelle et branding. Génère une charte graphique complète pour la marque décrite ci-dessous.

## Informations de la marque

- **Nom de la marque** : ${brandName}
- **Secteur d'activité** : ${sector}
- **Public cible** : ${targetAudience}
- **Positionnement** : ${positioning}
- **Directions artistiques souhaitées** : ${artDirList}

## Analyse du logo

- **Type de logo** : ${logoType}
- **Couleurs dominantes** : ${dominantColorList}
- **Style visuel perçu** : ${perceivedStyle}
- **Présence de texte dans le logo** : ${brandProfile.hasText === 'uncertain' ? 'non déterminé' : String(brandProfile.hasText)}
- **Ratio largeur/hauteur** : ${brandProfile.aspectRatio}

## Instructions

Génère UNIQUEMENT un objet JSON valide correspondant exactement au schéma suivant — aucun texte avant ni après :

\`\`\`json
{
  "colors": {
    "primary": "#rrggbb",
    "secondary": "#rrggbb",
    "accent": "#rrggbb",
    "background": "#rrggbb",
    "text": "#rrggbb"
  },
  "primaryFont": "Nom de la police principale (licence OFL uniquement, ex: Inter, Roboto, Lato)",
  "secondaryFont": "Nom de la police secondaire (licence OFL uniquement)",
  "typographyScale": {
    "xs": 10,
    "sm": 12,
    "base": 16,
    "lg": 20,
    "xl": 24,
    "xxl": 32
  },
  "spacingUnit": 8,
  "visualStyle": ["style1", "style2"],
  "logoRules": {
    "safeZone": 2,
    "minSize": 32,
    "allowedBackgrounds": ["fond blanc", "fond clair"],
    "forbiddenBackgrounds": ["fond sombre avec texte sombre"]
  },
  "forbidden": ["interdit explicite 1", "interdit explicite 2"],
  "version": 1
}
\`\`\`

Contraintes impératives :
- Toutes les couleurs DOIVENT être en hexadécimal 6 chiffres (#rrggbb).
- Les polices DOIVENT être à licence OFL (Open Font License) uniquement.
- La palette doit être cohérente avec les couleurs dominantes du logo et le positionnement de la marque.
- Le champ "version" doit être exactement 1.
- La réponse doit être un JSON pur, sans markdown ni explication.`;
}

// ─── JSON extraction helper ───────────────────────────────────────────────────

/**
 * Extract a JSON object from the LLM response string.
 * The model may wrap the JSON in markdown code fences; strip them first.
 */
function extractJson(raw: string): unknown {
  // Remove leading/trailing whitespace
  let text = raw.trim();

  // Strip markdown fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  return JSON.parse(text);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate (or retrieve) a brand charter for a project.
 *
 * - If a charter is already persisted for the project, return it immediately
 *   without calling the LLM (idempotence).
 * - Otherwise, call the LLM, validate the response, and persist the result.
 *
 * @param brandProfile      Validated BrandProfile from the analysis step
 * @param projectData       Brand metadata collected from the user
 * @param projectId         UUID of the project
 * @param existingVersion   Version number of the last charter, if any
 */
export async function generateCharter(
  brandProfile: BrandProfile,
  projectData: ProjectData,
  projectId: string,
  existingVersion?: number,
): Promise<Charter> {
  // ── 1. Idempotence check ──────────────────────────────────────────────────
  const persisted = await getCharter(projectId);
  if (persisted !== null) {
    log.info('[strategy/charter] Returning existing charter (idempotent)', {
      step: 'brand_strategy',
      projectId,
    });
    return persisted;
  }

  // ── 2. Build prompt ───────────────────────────────────────────────────────
  const systemMessage = {
    role: 'system' as const,
    content:
      'Tu es un expert en identité visuelle. Tu réponds uniquement en JSON valide, sans texte supplémentaire.',
  };
  const userMessage = {
    role: 'user' as const,
    content: buildPrompt(brandProfile, projectData),
  };

  const targetVersion = (existingVersion ?? 0) + 1;
  const maxRetries = env.MAX_RETRIES;

  let lastParseError: unknown;

  // ── 3. Retry loop (parse/validate) ────────────────────────────────────────
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    log.info('[strategy/charter] Calling LLM for charter generation', {
      step: 'brand_strategy',
      projectId,
      error: attempt > 0
        ? { code: `RETRY_${attempt}`, operation: 'chat' }
        : undefined,
    });

    let content: string;
    try {
      const result = await chat([systemMessage, userMessage], { projectId });
      content = result.content;
    } catch (llmErr) {
      // LLM errors (network, rate-limit exhausted) are fatal — propagate immediately
      log.error('[strategy/charter] LLM call failed', {
        step: 'brand_strategy',
        projectId,
        error: llmErr,
      });
      throw llmErr;
    }

    // ── 4. Parse JSON ───────────────────────────────────────────────────────
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch (parseErr) {
      lastParseError = parseErr;
      log.warn('[strategy/charter] Failed to parse LLM JSON response', {
        step: 'brand_strategy',
        projectId,
        error: { code: 'JSON_PARSE_ERROR', operation: 'chat', attempts: attempt + 1 },
      });
      if (attempt < maxRetries) continue;
      break;
    }

    // ── 5. Validate with zod schema ─────────────────────────────────────────
    const validation = charterSchema.safeParse(parsed);
    if (!validation.success) {
      lastParseError = validation.error;
      log.warn('[strategy/charter] Charter JSON failed schema validation', {
        step: 'brand_strategy',
        projectId,
        error: {
          code: 'SCHEMA_VALIDATION_ERROR',
          operation: 'chat',
          attempts: attempt + 1,
        },
      });
      if (attempt < maxRetries) continue;
      break;
    }

    // ── 6. Set correct version ──────────────────────────────────────────────
    const charter: Charter = {
      ...validation.data,
      version: targetVersion,
    };

    // ── 7. Persist ──────────────────────────────────────────────────────────
    await saveCharter(projectId, charter);

    log.info('[strategy/charter] Charter generated and persisted', {
      step: 'brand_strategy',
      projectId,
    });

    // ── 8. Return ───────────────────────────────────────────────────────────
    return charter;
  }

  // All retries exhausted
  log.error('[strategy/charter] Charter generation failed after all retries', {
    step: 'brand_strategy',
    projectId,
    error: {
      code: 'MAX_RETRIES_EXCEEDED',
      operation: 'chat',
      attempts: maxRetries + 1,
    },
  });

  throw new Error(
    `[strategy/charter] Failed to generate a valid charter after ${maxRetries + 1} attempts: ${
      lastParseError instanceof Error ? lastParseError.message : String(lastParseError)
    }`,
  );
}
