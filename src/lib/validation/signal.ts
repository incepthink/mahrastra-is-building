import { z } from "zod";

import { SIGNAL_STATUSES } from "@/types/signal";
import type { DataAttribution, Signal, StatewideSignal } from "@/types/signal";

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

/**
 * A statewide record: the same schema with the addressing fields taken out.
 *
 * Derived from `signalSchema` rather than written beside it so the two can
 * never drift — a field added to a record is a field a policy record gets too,
 * and the only difference between them stays the one difference that is real.
 * `scope` is required and literal: a file of these is a claim that everything
 * in it applies to the whole state, and the claim is made per record.
 *
 * `coordinates` stays required, and it is still the only field in here that
 * was chosen rather than found. A policy has no district, taluka or locality —
 * those three go — but it does need somewhere to be drawn, so the file carries
 * a hand-picked point per record. See `StatewideSignal`.
 */
export const statewideSignalSchema = signalSchema
  .omit({ district: true, taluka: true, locality: true })
  .extend({ scope: z.literal("state") }) satisfies z.ZodType<StatewideSignal, unknown>;

export const statewideFileSchema = z.object({
  meta: z.object({
    scope: z.literal("state"),
    updatedAt: z.string().optional(),
    attribution: attributionSchema,
  }),
  signals: z.array(statewideSignalSchema),
});
