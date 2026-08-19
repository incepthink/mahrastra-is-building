import { z } from "zod";

import { SIGNAL_STATUSES } from "@/types/signal";
import type { DataAttribution, Signal } from "@/types/signal";

/** Brief §5: records live in local files, so the schema is the only gate
 *  between a scraper run and the map. Unknown keys are dropped, not rejected —
 *  the pipeline is allowed to add fields ahead of the UI. */
const basis = z.enum(["stated", "keyword", "default"]).optional();

const provenance = z.object({
  sourceId: z.string(),
  sourceLabel: z.string(),
  sourceUrl: z.url(),
  sourceTitle: z.string().optional(),
  sourceDescription: z.string().optional(),
  titleEn: z.string().optional(),
  summaryEn: z.string().optional(),
  noticeType: z.string().optional(),
  validUntil: z.string().optional(),
  detailUrl: z.url().optional(),
  detailUrlMr: z.url().optional(),
  scrapedAt: z.string().optional(),
});

const confidence = z.object({
  category: basis,
  status: basis,
  agency: basis,
  location: z.enum(["village", "taluka", "district"]).optional(),
  locationMatch: z.string().optional(),
});

/** Written by `scripts/enrich-marathi.mjs`, never by hand and never at request
 *  time. Every field is required: a half-written card would render as a gap. */
const card = z.object({
  headline: z.string().min(1),
  gist: z.string().min(1),
  impact: z.string().min(1),
  placeMr: z.string().min(1),
  agencyMr: z.string().min(1),
  model: z.string().optional(),
  generatedAt: z.string().optional(),
});

export const signalSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  titleMr: z.string().optional(),
  summary: z.string(),
  summaryMr: z.string().optional(),
  category: z.enum([
    "infrastructure",
    "energy",
    "transportation",
    "public-systems",
    "manufacturing",
    "research",
    "agriculture",
    "water",
    "housing",
    "environment",
  ]),
  status: z.enum(SIGNAL_STATUSES),
  publishedAt: z.string(),
  milestoneDate: z.string().optional(),
  district: z.string(),
  taluka: z.string().optional(),
  locality: z.string().optional(),
  // Longitude first, matching GeoJSON and the brief.
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  implementingAgency: z.string(),
  outcome: z.string().optional(),
  evidenceLabel: z.string().optional(),
  evidenceUrl: z.url().optional(),
  imageUrl: z.string().optional(),
  featured: z.boolean().optional(),
  provenance: provenance.optional(),
  confidence: confidence.optional(),
  card: card.optional(),
  needsTranslation: z.boolean().optional(),
  needsReview: z.boolean().optional(),
}) satisfies z.ZodType<Signal, unknown>;

const credit = z.object({
  label: z.string(),
  url: z.url(),
  note: z.string().optional(),
});

export const attributionSchema = z.object({
  content: credit,
  geocoding: credit.optional(),
}) satisfies z.ZodType<DataAttribution, unknown>;

export const signalFileSchema = z.object({
  meta: z.object({
    district: z.string(),
    scrapedAt: z.string().optional(),
    attribution: attributionSchema,
  }),
  signals: z.array(signalSchema),
});
