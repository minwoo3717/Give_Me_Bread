import "server-only";

import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { errorFields, logger } from "./logger";

let client: CloudFrontClient | undefined;

/**
 * Drops cached HTML at the CloudFront edge after content changes.
 *
 * "/*" counts as a single invalidation path (the first 1,000 paths per month
 * are free) and also covers query-string variants such as RSC requests
 * (?_rsc=...). Static assets live in S3 under hashed names, so evicting them
 * only costs one extra fetch from S3.
 *
 * No-op when CLOUDFRONT_DISTRIBUTION_ID is unset (local development).
 */
export async function invalidateCdn(reason: string, paths: string[] = ["/*"]): Promise<void> {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!distributionId) {
    logger.debug("cdn invalidation skipped (no distribution configured)", { reason });
    return;
  }
  client ??= new CloudFrontClient({});
  try {
    const result = await client.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${reason}-${Date.now()}`,
          Paths: { Quantity: paths.length, Items: paths },
        },
      }),
    );
    logger.info("cdn invalidation created", { reason, id: result.Invalidation?.Id, paths });
  } catch (err) {
    // The edit is saved; the page will refresh when the 5-minute TTL expires.
    logger.error("cdn invalidation failed", { reason, ...errorFields(err) });
  }
}
