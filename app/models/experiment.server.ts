import { ConsentSubjectType } from "@prisma/client";
import db from "../db.server";
import { subjectFromIdentity } from "../ai/intent/profile.server";
import { identityKey } from "../ai/decide/contract";
import { pickAbVariantId } from "../ai/experiment/assign";

export async function ensureAbExperiment(input: {
  shop: string;
  experienceId: string;
  campaignId?: string | null;
  name?: string;
}): Promise<{ experimentId: string; variantIds: string[] }> {
  const variants = await db.experienceVariant.findMany({
    where: { shop: input.shop, experienceId: input.experienceId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let variantIds = variants.map((row) => row.id);
  if (variantIds.length < 2) {
    const treatment = await db.experienceVariant.create({
      data: {
        shop: input.shop,
        experienceId: input.experienceId,
        layout: "treatment",
        headline: "A different take",
        cta: "See this instead",
      },
    });
    variantIds = [...variantIds, treatment.id];
  }

  const experiment = await db.experiment.upsert({
    where: {
      shop_experienceId: { shop: input.shop, experienceId: input.experienceId },
    },
    create: {
      shop: input.shop,
      experienceId: input.experienceId,
      campaignId: input.campaignId ?? null,
      name: input.name ?? "Experience A/B",
      status: "active",
    },
    update: {
      campaignId: input.campaignId ?? undefined,
      status: "active",
    },
  });

  return { experimentId: experiment.id, variantIds };
}

export async function assignExperienceVariant(input: {
  shop: string;
  experienceId: string;
  campaignId?: string | null;
  name?: string;
  holdout: boolean;
  customerId?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
  surface?: string | null;
}): Promise<{
  experimentId: string;
  variantId: string | null;
  holdout: boolean;
  headline: string;
  cta: string;
}> {
  const { experimentId, variantIds } = await ensureAbExperiment({
    shop: input.shop,
    experienceId: input.experienceId,
    campaignId: input.campaignId,
    name: input.name,
  });
  const subject = subjectFromIdentity(input) ?? {
    subjectType: ConsentSubjectType.anon,
    subjectId: identityKey(input),
  };
  const variantId = input.holdout
    ? null
    : pickAbVariantId(input.shop, experimentId, identityKey(input), variantIds);

  await db.experimentAssignment.upsert({
    where: {
      shop_experimentId_subjectType_subjectId: {
        shop: input.shop,
        experimentId,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
      },
    },
    create: {
      shop: input.shop,
      experimentId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      variantId,
      holdout: input.holdout,
      surface: input.surface ?? "_",
    },
    update: {
      variantId,
      holdout: input.holdout,
      surface: input.surface ?? "_",
    },
  });

  const chosen = variantId
    ? await db.experienceVariant.findUnique({
        where: { id: variantId },
        select: { headline: true, cta: true },
      })
    : null;

  return {
    experimentId,
    variantId,
    holdout: input.holdout,
    headline: chosen?.headline ?? "",
    cta: chosen?.cta ?? "",
  };
}
