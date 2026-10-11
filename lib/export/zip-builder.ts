/**
 * lib/export/zip-builder.ts — ZIP pack archive builder
 *
 * Implements:
 *  - Stable versioned folder structure:
 *      logo/original/
 *      assets/
 *      mockups/
 *      brandbook/
 *      README.txt
 *  - Automatic generation of README.txt detailing all files, dimensions, and usage (print vs presentation)
 *  - In-memory archiver compression stream to buffer
 *
 * Requirements: 17.1, 17.2, 17.4, 17.5
 */

import { ZipArchive } from "archiver";
import { PassThrough } from "stream";

export interface ZipItem {
  zipPath: string; // e.g. "assets/avatar.png"
  buffer: Buffer;
  dimensions?: string;
  usage?: "print" | "digital" | "presentation" | "original";
}

export interface ZipBuilderOptions {
  brandName: string;
  items: ZipItem[];
}

/**
 * Generate a descriptive README.txt content listing all files in the delivery pack.
 */
export function generateReadmeText(brandName: string, items: ZipItem[]): string {
  const lines: string[] = [
    `========================================================================`,
    `                      PACK IDENTITÉ DE MARQUE - ${brandName.toUpperCase()}`,
    `========================================================================`,
    ``,
    `Ce dossier contient tous les livrables de votre identité visuelle.`,
    `Tous les éléments ont été conçus et contrôlés conformément à votre charte.`,
    ``,
    `------------------------------------------------------------------------`,
    `SOMMAIRE DES FICHIERS`,
    `------------------------------------------------------------------------`,
  ];

  for (const item of items) {
    const dim = item.dimensions ? ` (${item.dimensions})` : "";
    const usage = item.usage ? ` [Usage: ${item.usage}]` : "";
    lines.push(`• ${item.zipPath}${dim}${usage}`);
  }

  lines.push(
    ``,
    `------------------------------------------------------------------------`,
    `CONSIGNES D'UTILISATION`,
    `------------------------------------------------------------------------`,
    `1. Brandbook (brandbook/brandbook.pdf) :`,
    `   Consultez ce document pour connaître toutes les règles de votre marque`,
    `   (couleurs exactes, polices, zone de sécurité du logo, interdits).`,
    ``,
    `2. Supports Print (ex: carte de visite) :`,
    `   Prêts pour l'impression haute définition à 300 DPI.`,
    ``,
    `3. Mockups (dossier mockups/{category}/) :`,
    `   Étiquetés « présentation » uniquement, destinés à vos maquettes et présentations`,
    `   clients. Rendu en cadre plat sans déformation perspective (limitation déterministe).`,
    `   Ne JAMAIS utiliser directement comme fichiers d'impression (« prêt à imprimer »).`,
    ``,
    `4. Polices :`,
    `   Les polices utilisées sont sous licence libre (SIL Open Font License).`,
    ``,
    `========================================================================`,
  );

  return lines.join("\n");
}

/**
 * Build a complete ZIP pack buffer containing all items and a generated README.txt.
 */
export async function buildZipArchive(options: ZipBuilderOptions): Promise<Buffer> {
  const { brandName, items } = options;

  const readmeContent = generateReadmeText(brandName, items);
  const allItems: ZipItem[] = [
    ...items,
    {
      zipPath: "README.txt",
      buffer: Buffer.from(readmeContent, "utf-8"),
      usage: "digital",
    },
  ];

  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({
      zlib: { level: 9 },
    });

    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err: unknown) => reject(err));

    archive.on("error", (err: unknown) => reject(err));
    archive.pipe(stream);

    for (const item of allItems) {
      archive.append(item.buffer, { name: item.zipPath });
    }

    archive.finalize();
  });
}
