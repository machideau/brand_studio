import { db } from "@/lib/db/client";
import type { DeliveryRecord } from "@/lib/db/types";

/**
 * Persist a delivery record once the ZIP has been sent to the user.
 */
export async function recordDelivery(
  data: Omit<DeliveryRecord, "id">,
): Promise<DeliveryRecord> {
  const { data: result, error } = await db
    .from("delivery_records")
    .insert(data)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `[db/deliveries] recordDelivery failed: ${error.message}`,
    );
  }

  return result as DeliveryRecord;
}
