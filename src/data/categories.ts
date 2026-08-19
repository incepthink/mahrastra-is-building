import {
  Building2,
  Cpu,
  Droplets,
  Factory,
  House,
  Landmark,
  Mountain,
  Sprout,
  TrainFront,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { SignalCategoryId } from "@/types/signal";

export type Category = {
  id: SignalCategoryId;
  label: string;
  labelMr: string;
  icon: LucideIcon;
  /** The sector's pastel plate — chip grounds and the collar behind a pin. */
  tint: string;
};

/**
 * The ten sectors.
 *
 * Categories used to be deliberately colourless, so that status could own the
 * whole palette. That held while a category was only ever an icon inside a
 * status-coloured disc. It stopped holding the moment the map became one pin
 * per group: a reader now has to tell two adjacent pins apart at a glance, and
 * an icon at 13px is not enough on its own.
 *
 * So a sector gets a *plate* and a status gets an *ink*. They cannot be
 * confused because they are used at different saturations and in different
 * places — the pastel always fills the mark, the ink always rings it. The
 * plate is the one that fills, because the plate is what the brand plate's
 * legend keys: a reader matching a legend row against the map is matching
 * areas of colour, not hairlines.
 *
 * Water, housing and environment were added when the pilot took in Pune and
 * stopped being one district's land-acquisition file. They are not refinements
 * of `infrastructure`: a sewage treatment plant, a Housing-for-All plot list
 * and a sand-group environmental clearance answer different questions, and
 * filing all three under one plate is what made the first map read as a single
 * category with twenty-five pins in it.
 */
export const CATEGORIES: Category[] = [
  {
    id: "infrastructure",
    label: "Infrastructure",
    labelMr: "पायाभूत सुविधा",
    icon: Building2,
    tint: "var(--color-sector-infrastructure)",
  },
  {
    id: "transportation",
    label: "Transportation",
    labelMr: "वाहतूक",
    icon: TrainFront,
    tint: "var(--color-sector-transportation)",
  },
  {
    id: "energy",
    label: "Energy",
    labelMr: "ऊर्जा",
    icon: Zap,
    tint: "var(--color-sector-energy)",
  },
  {
    id: "public-systems",
    label: "Public systems",
    labelMr: "सार्वजनिक सेवा",
    icon: Landmark,
    tint: "var(--color-sector-public-systems)",
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    labelMr: "उत्पादन",
    icon: Factory,
    tint: "var(--color-sector-manufacturing)",
  },
  {
    id: "research",
    label: "Research",
    labelMr: "संशोधन",
    icon: Cpu,
    tint: "var(--color-sector-research)",
  },
  {
    id: "agriculture",
    label: "Agriculture",
    labelMr: "शेती",
    icon: Sprout,
    tint: "var(--color-sector-agriculture)",
  },
  {
    id: "water",
    label: "Water and sanitation",
    labelMr: "पाणी व स्वच्छता",
    icon: Droplets,
    tint: "var(--color-sector-water)",
  },
  {
    id: "housing",
    label: "Housing",
    labelMr: "घरकुल",
    icon: House,
    tint: "var(--color-sector-housing)",
  },
  {
    id: "environment",
    label: "Environment and minerals",
    labelMr: "पर्यावरण व गौणखनिज",
    icon: Mountain,
    tint: "var(--color-sector-environment)",
  },
];
