import { db } from "@/lib/db/client";

/** Supabase Storage bucket name for all Brand Studio files */
const BUCKET = "brand-studio";

/**
 * Uploads a logo file to Supabase Storage under the path:
 *   `logo/original/{projectId}/{filename}`
 *
 * The original file is stored as-is and must never be modified after upload
 * (Requirement 7.7).
 *
 * @param projectId - UUID of the project
 * @param buffer    - Raw file buffer to upload
 * @param filename  - Original filename (used as the last path segment)
 * @returns The storage path used for the upload
 */
export async function uploadLogo(
  projectId: string,
  buffer: Buffer,
  filename: string
): Promise<string> {
  const storagePath = `logo/original/${projectId}/${filename}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      upsert: false,
      contentType: inferContentType(filename),
    });

  if (error) {
    throw new Error(
      `Échec de l'upload du logo vers Supabase Storage (chemin : ${storagePath}) : ${error.message}`
    );
  }

  return storagePath;
}

/**
 * Uploads an arbitrary file buffer to Supabase Storage at a specific path.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string = "image/png",
): Promise<string> {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      upsert: true,
      contentType,
    });

  if (error) {
    throw new Error(
      `Échec de l'upload du fichier vers Supabase Storage (chemin : ${storagePath}) : ${error.message}`,
    );
  }

  return storagePath;
}

/**
 * Downloads a file from Supabase Storage and returns its content as a Buffer.
 *
 * @param storagePath - Full path within the bucket (e.g. `logo/original/{id}/logo.png`)
 * @returns The file content as a Buffer
 */
export async function downloadFile(storagePath: string): Promise<Buffer> {
  const { data, error } = await db.storage
    .from(BUCKET)
    .download(storagePath);

  if (error || data === null) {
    throw new Error(
      `Échec du téléchargement depuis Supabase Storage (chemin : ${storagePath}) : ${error?.message ?? "données nulles"}`
    );
  }

  // Supabase returns a Blob; convert to Node.js Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Infers a MIME content type from a filename extension.
 * Falls back to `application/octet-stream` for unknown extensions.
 */
function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
