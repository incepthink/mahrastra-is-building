/**
 * How a district's article count becomes a step on the choropleth ramp.
 *
 * The distribution this has to survive is brutally skewed. On a normal day
 * Mumbai files a hundred pieces and Solapur files four, and the other
 * thirty-three sit in a heap near the bottom — so a linear ramp from 0 to the
 * maximum paints Mumbai, leaves the entire state one indistinguishable pale
 * wash, and answers a question nobody asked ("which district is Mumbai?").
 *
 * Quantile breaks instead: sort the districts that have any news, cut the list
 * into five equal groups, and paint by which group a district lands in. The
 * ramp then always uses its whole range and the map is always readable, which
 * is the property that matters for a surface that gets repainted every half
 * hour against a corpus nobody has looked at yet.
 *
 * The cost is real and worth stating: the steps mean **rank, not amount**. A
 * district at level 5 has more news than four fifths of the state, not "a lot"
 * in any absolute sense, and on a very quiet day the top step could be nine
 * articles. That is why the legend prints the actual count band beside each
 * step and why the readout gives the district's own figure — the paint says
 * where to look, the numbers say how much.
 *
 * Districts with nothing in the window are level 0 and are painted as bare
 * land, not as the bottom of the ramp. "No news reached us from here" and
 * "least news in the state" are different statements and the map should not
 * merge them.
 */
export const LEVELS = 5;

export type Scale = {
  /** Upper count of each level, ascending. `breaks[i]` closes level `i + 1`. */
  breaks: number[];
  levelOf: (count: number) => number;
  /** The inclusive count band a level covers, for the legend. */
  bandOf: (level: number) => [min: number, max: number] | null;
};

/**
 * Build the scale from the counts actually present.
 *
 * Zeroes are excluded before the quantiles are taken. Leaving them in would
 * hand whole levels to districts that have no news — with a third of the state
 * quiet, the bottom two steps of the ramp would both mean "nothing", and the
 * three remaining steps would have to carry the entire spread.
 */
export function quantileScale(counts: number[]): Scale {
  const present = counts.filter((count) => count > 0).sort((a, b) => a - b);

  if (present.length === 0) {
    return {
      breaks: [],
      levelOf: () => 0,
      bandOf: () => null,
    };
  }

  // Distinct upper bounds only: with few districts in play two quantiles can
  // land on the same count, and two ramp steps meaning the identical number is
  // a legend that lies about how finely the map is graded.
  const breaks = [...new Set(
    Array.from({ length: LEVELS }, (_, index) => {
      const at = Math.ceil(((index + 1) / LEVELS) * present.length) - 1;

      return present[Math.min(at, present.length - 1)];
    }),
  )];

  const levelOf = (count: number): number => {
    if (count <= 0) return 0;

    const index = breaks.findIndex((upper) => count <= upper);

    return index === -1 ? breaks.length : index + 1;
  };

  const bandOf = (level: number): [number, number] | null => {
    if (level < 1 || level > breaks.length) return null;

    const lower = level === 1 ? Math.min(...present) : breaks[level - 2] + 1;

    return [lower, breaks[level - 1]];
  };

  return { breaks, levelOf, bandOf };
}
