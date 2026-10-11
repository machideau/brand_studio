/**
 * lib/export/delivery.ts — Telegram delivery of ZIP archives
 *
 * Implements:
 *  - Send ZIP as Telegram document if < 50 MB
 *  - Fallback to expiring signed Supabase Storage URL if >= 50 MB
 *  - Persists record in delivery_records table
 *
 * Requirements: 17.3
 */

import { Bot, InputFile } from "grammy";
import env from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { recordDelivery } from "@/lib/db/queries/deliveries";
import { log } from "@/lib/logger";

export interface DeliverZipOptions {
  projectId: string;
  telegramUserId: number;
  brandName: string;
  zipBuffer: Buffer;
  storagePath: string;
}

const FIFTY_MB = 50 * 1024 * 1024;

export async function deliverZipPack(options: DeliverZipOptions): Promise<{
  method: "send_document" | "signed_url";
  success: boolean;
}> {
  const { projectId, telegramUserId, brandName, zipBuffer, storagePath } = options;
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  let method: "send_document" | "signed_url" = "send_document";

  try {
    if (zipBuffer.length < FIFTY_MB) {
      log.info(`Delivering ZIP pack via Telegram document (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB)`, {
        projectId,
        step: "delivery",
      });

      const filename = `${brandName.toLowerCase().replace(/\s+/g, "_")}_brand_pack.zip`;
      await bot.api.sendDocument(
        telegramUserId,
        new InputFile(zipBuffer, filename),
        {
          caption: `🎉 *Votre identité de marque pour ${brandName} est prête !*\n\nLe pack complet ci-joint contient vos logos, charte graphique PDF, assets déclinés et le guide d'utilisation.`,
          parse_mode: "Markdown",
        },
      );
      method = "send_document";
    } else {
      log.info(`ZIP pack exceeds 50 MB. Generating expiring signed URL`, {
        projectId,
        step: "delivery",
      });

      const { data: signedData, error: signedError } = await db.storage
        .from("brand-studio")
        .createSignedUrl(storagePath, 7 * 24 * 3600); // 7 days

      if (signedError || !signedData?.signedUrl) {
        throw new Error(
          `Failed to create signed URL for delivery: ${signedError?.message}`,
        );
      }

      await bot.api.sendMessage(
        telegramUserId,
        `🎉 *Votre pack de marque pour ${brandName} est prêt !*\n\nEn raison de sa taille (${(zipBuffer.length / 1024 / 1024).toFixed(1)} Mo), téléchargez-le directement via ce lien sécurisé (valide 7 jours) :\n\n🔗 [Télécharger mon pack de marque](${signedData.signedUrl})`,
        { parse_mode: "Markdown" },
      );
      method = "signed_url";
    }

    await recordDelivery({
      project_id: projectId,
      method,
      storage_path: storagePath,
      delivered_at: new Date().toISOString(),
    });

    return { method, success: true };
  } catch (err) {
    log.error("Failed to deliver pack to Telegram user", {
      projectId,
      step: "delivery",
      error: {
        code: "DELIVERY_ERROR",
        operation: "deliverZipPack",
      },
    });
    throw err;
  }
}
