/**
 * Pull the `NewsArticle` out of a page's JSON-LD.
 *
 * Both sources ship a complete schema.org `NewsArticle` in a
 * `<script type="application/ld+json">` block — headline, datePublished,
 * dateModified, articleSection, keywords, author, image and the full
 * articleBody. So this engine reads none of their HTML structure. That is a
 * deliberate choice: CSS selectors break silently every time a masthead
 * redesigns, and you find out weeks later when a source has been quietly
 * returning nothing. JSON-LD is the contract these sites keep with Google, so
 * it is the one thing they cannot afford to break.
 *
 * Lokmat puts the NewsArticle first among eight blocks; Loksatta puts it fourth
 * among six. Neither ordering is promised, so every block is searched.
 */
import { decodeEntities } from "../../lib/html.mjs";

const first = (value) => (Array.isArray(value) ? value[0] : value);

function flatten(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  const nested = Array.isArray(node["@graph"]) ? node["@graph"].flatMap(flatten) : [];
  return [node, ...nested];
}

const isArticle = (node) => {
  const type = node?.["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && /Article|Report|BlogPosting/i.test(t));
};

function nameOf(value) {
  const one = first(value);
  if (!one) return null;
  if (typeof one === "string") return one;
  return one.name ?? one.url ?? null;
}

function imageOf(value) {
  const one = first(value);
  if (!one) return null;
  if (typeof one === "string") return one;
  return one.url ?? first(one.contentUrl) ?? null;
}

const clean = (value) =>
  value == null ? null : decodeEntities(String(value)).replace(/\s+/g, " ").trim() || null;

/**
 * Returns the article's fields, or `null` when the page carries no article
 * block — which is the honest answer for a section index or a paywall stub, and
 * is recorded as a failed fetch rather than guessed at.
 */
export function extractNewsArticle(html) {
  const blocks = [...String(html).matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )];

  for (const [, raw] of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue; // a malformed block is not a reason to abandon the page
    }

    const article = flatten(parsed).find(isArticle);
    if (!article) continue;

    const keywords = Array.isArray(article.keywords)
      ? article.keywords.join(", ")
      : article.keywords;

    const body = clean(article.articleBody);

    return {
      headline: clean(article.headline ?? article.name),
      description: clean(article.description),
      articleSection: clean(nameOf(article.articleSection)),
      keywords: clean(keywords),
      author: clean(nameOf(article.author)),
      imageUrl: clean(imageOf(article.image)),
      publishedAt: clean(article.datePublished),
      modifiedAt: clean(article.dateModified ?? article.datePublished),
      body,
      wordCount: body ? body.split(/\s+/).length : 0,
    };
  }

  return null;
}
