import { serve } from "inngest/next";
import { inngest } from "@/inngest";

import { validateFileJob } from "@/jobs/validate-file";
import { analyzeLogoJob } from "@/jobs/analyze-logo";
import { brandStrategyJob } from "@/jobs/brand-strategy";
import { planAssetsJob } from "@/jobs/plan-assets";
import { generateAssetsJob } from "@/jobs/generate-assets";
import { composeJob } from "@/jobs/compose";
import { qualityControlJob } from "@/jobs/quality-control";
import { revisionJob } from "@/jobs/revision";
import { brandbookJob } from "@/jobs/brandbook";
import { exportZipJob } from "@/jobs/export-zip";
import { deliverJob } from "@/jobs/deliver";
import { cleanupJob } from "@/jobs/cleanup";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    validateFileJob,
    analyzeLogoJob,
    brandStrategyJob,
    planAssetsJob,
    generateAssetsJob,
    composeJob,
    qualityControlJob,
    revisionJob,
    brandbookJob,
    exportZipJob,
    deliverJob,
    cleanupJob,
  ],
});
