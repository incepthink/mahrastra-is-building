import { CATEGORIES } from "@/data/categories";
import type { Category } from "@/data/categories";
import type { SignalCategoryId } from "@/types/signal";

const CATEGORY_BY_ID = new Map<SignalCategoryId, Category>(
  CATEGORIES.map((category) => [category.id, category]),
);

/**
 * The sector a record belongs to, with its icon and both labels.
 *
 * This module used to hold the whole display layer — English/Marathi text
 * selection, coordinate formatting, notice-window progress, a bilingual test.
 * The interface is Marathi-only now and the panel shows neither coordinates
 * nor a progress bar, so all of that went; what Marathi formatting the product
 * still needs lives in `marathi.ts`.
 */
export function categoryOf(id: SignalCategoryId): Category {
  const category = CATEGORY_BY_ID.get(id);

  if (!category) throw new Error(`Unknown category: ${id}`);

  return category;
}
