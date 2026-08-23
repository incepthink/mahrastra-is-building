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
  /** The sector's MARK — a saturated fill that always carries a white glyph.
   *  Pin heads, the legend's icon badges, the dot leading a ticker headline. */
  tint: string;
  /** The sector's SURFACE — the pale version of the same hue, for areas that
   *  have ordinary body text on them: the record panel's header, the "what
   *  this means" block, the report dialog's head. */
  plate: string;
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
 * So a sector gets a *hue* and a status gets an *ink*. They cannot be
 * confused because they live on different surfaces: the sector hue fills the
 * mark, the status ink only ever appears beside it — on the stage meter, the
 * panel's leading edge, a cluster's chips.
 *
 * Each sector carries that hue at two strengths. `tint` is the saturated one
 * and it fills anything small enough to need finding — a pin head, a legend
 * badge — always under a white glyph. `plate` is the pale one and it fills
 * anything large enough to be read on — a panel header, a callout block. One
 * pastel used to do both jobs, which meant the pin was as quiet as the panel,
 * and a pin is the smallest thing on screen.
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
    plate: "var(--color-sector-infrastructure-plate)",
  },
  {
    id: "transportation",
    label: "Transportation",
    labelMr: "वाहतूक",
    icon: TrainFront,
    tint: "var(--color-sector-transportation)",
    plate: "var(--color-sector-transportation-plate)",
  },
  {
    id: "energy",
    label: "Energy",
    labelMr: "ऊर्जा",
    icon: Zap,
    tint: "var(--color-sector-energy)",
    plate: "var(--color-sector-energy-plate)",
  },
  {
    id: "public-systems",
    label: "Public systems",
    labelMr: "सार्वजनिक सेवा",
    icon: Landmark,
    tint: "var(--color-sector-public-systems)",
    plate: "var(--color-sector-public-systems-plate)",
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    labelMr: "उत्पादन",
    icon: Factory,
    tint: "var(--color-sector-manufacturing)",
    plate: "var(--color-sector-manufacturing-plate)",
  },
  {
    id: "research",
    label: "Research",
    labelMr: "संशोधन",
    icon: Cpu,
    tint: "var(--color-sector-research)",
    plate: "var(--color-sector-research-plate)",
  },
  {
    id: "agriculture",
    label: "Agriculture",
    labelMr: "शेती",
    icon: Sprout,
    tint: "var(--color-sector-agriculture)",
    plate: "var(--color-sector-agriculture-plate)",
  },
  {
    id: "water",
    label: "Water and sanitation",
    labelMr: "पाणी व स्वच्छता",
    icon: Droplets,
    tint: "var(--color-sector-water)",
    plate: "var(--color-sector-water-plate)",
  },
  {
    id: "housing",
    label: "Housing",
    labelMr: "घरकुल",
    icon: House,
    tint: "var(--color-sector-housing)",
    plate: "var(--color-sector-housing-plate)",
  },
  {
    id: "environment",
    label: "Environment and minerals",
    labelMr: "पर्यावरण व गौणखनिज",
    icon: Mountain,
    tint: "var(--color-sector-environment)",
    plate: "var(--color-sector-environment-plate)",
  },
];
