/** CORE036: legacy functions recovered from release/asarvo-1.0.
 * Functions execute only when explicitly called through the factory.
 * Exact legacy function bodies, with dependencies injected at factory scope.
 * Not wired to /api/search. No live verification claimed.
 */
export type UniversalRequirement = { key:string; value:string; hard?:boolean; [key:string]:unknown };
export type ParsedQuery = {
  intent:{required:UniversalRequirement[];preferred:UniversalRequirement[];anyOfRequired:UniversalRequirement[][]}
};
export type AsarvoIntentCoreV6StructuredSpecPair = {label:string;value:string;evidence:string};
export type AsarvoIntentCoreV7RequirementState = "match"|"conflict"|"absent"|"ambiguous";
export type Core036Dependencies = {
 normalizeText:(value:string)=>string;
 normalizeMatchText:(value:string)=>string;
 extractTagText:(value:string)=>string;
 universalRequirementComparison:(requirement:UniversalRequirement)=>string;
 buildCanonicalRequirementProofToken:(requirement:UniversalRequirement)=>string;
 requirementHasEvidenceInContext:(requirement:UniversalRequirement,evidence:string,all:readonly UniversalRequirement[])=>boolean;
 hasConflictingHardRequirementInTitle:(requirement:UniversalRequirement,evidence:string,all:readonly UniversalRequirement[])=>boolean;
};
export function createCore036StructuredSpecs(deps:Core036Dependencies) {
 const {normalizeText,normalizeMatchText,extractTagText,universalRequirementComparison,
 buildCanonicalRequirementProofToken,requirementHasEvidenceInContext,hasConflictingHardRequirementInTitle}=deps;
function asarvoIntentCoreV6CleanSpecCell(
  valueRaw: string
): string {
  return normalizeText(
    extractTagText(
      String(valueRaw)
        .replace(/<br\s*\/?>/giu, " ")
        .replace(/&nbsp;/giu, " ")
    )
  )
    .replace(/\s+/g, " ")
    .trim();
}

function asarvoIntentCoreV6CanonicalRequirementEvidenceFromStructuredSpecs(
  htmlRaw: string,
  parsed: ParsedQuery
): string {
  const allRequirements =
    asarvoIntentCoreV8AllIntentRequirements(
      parsed
    );

  if (allRequirements.length === 0) return "";

  const pairs =
    asarvoIntentCoreV6ExtractStructuredSpecPairsFromHtml(
      htmlRaw
    );

  if (pairs.length === 0) return "";

  const canonical: string[] = [];
  const seen = new Set<string>();

  for (const requirement of allRequirements) {
    const structuredState =
      asarvoIntentCoreV7StructuredRequirementStateFromPairs(
        requirement,
        pairs,
        allRequirements
      );

    if (structuredState !== "match") continue;

    const id = [
      requirement.key,
      universalRequirementComparison(requirement),
      normalizeMatchText(requirement.value),
    ].join(":");

    if (seen.has(id)) continue;
    seen.add(id);

    canonical.push(
      buildCanonicalRequirementProofToken(
        requirement
      )
    );
  }

  return normalizeText(
    canonical.join(" ")
  ).slice(0, 8_000);
}

function asarvoIntentCoreV6ExtractStructuredSpecPairsFromHtml(
  htmlRaw: string
): AsarvoIntentCoreV6StructuredSpecPair[] {
  if (!htmlRaw) return [];

  const html =
    asarvoIntentCoreV6TrimSpecHtmlAtRecommendationBoundary(
      asarvoSearchCoreV19StripSiblingVariantHtmlSurfaces(
        htmlRaw
      )
    );

  const pairs: AsarvoIntentCoreV6StructuredSpecPair[] = [];
  const seen = new Set<string>();

  const pushPair = (
    labelRaw: string,
    valueRaw: string
  ): void => {
    const label =
      asarvoIntentCoreV6CleanSpecCell(labelRaw);
    const value =
      asarvoIntentCoreV6CleanSpecCell(valueRaw);

    if (
      !asarvoIntentCoreV6SpecPairIsSafe(
        label,
        value
      )
    ) {
      return;
    }

    const evidence =
      normalizeText(`${label} ${value}`);

    const key =
      normalizeMatchText(evidence);

    if (!key || seen.has(key)) return;
    seen.add(key);

    pairs.push({
      label,
      value,
      evidence,
    });
  };

  let rowMatch: RegExpExecArray | null;
  const rowRegex =
    /<tr\b[^>]*>([\s\S]{0,5000}?)<\/tr>/giu;

  let rowCount = 0;

  while (
    (rowMatch = rowRegex.exec(html)) !== null &&
    rowCount < 500
  ) {
    const cells = Array.from(
      rowMatch[1].matchAll(
        /<(?:th|td)\b[^>]*>([\s\S]{0,1800}?)<\/(?:th|td)>/giu
      )
    ).map((match) => match[1]);

    if (cells.length >= 2 && cells.length <= 4) {
      pushPair(cells[0], cells.slice(1).join(" "));
    }

    rowCount += 1;
  }

  let dlMatch: RegExpExecArray | null;
  const dlRegex =
    /<dt\b[^>]*>([\s\S]{0,1200}?)<\/dt>\s*<dd\b[^>]*>([\s\S]{0,2400}?)<\/dd>/giu;

  let dlCount = 0;

  while (
    (dlMatch = dlRegex.exec(html)) !== null &&
    dlCount < 500
  ) {
    pushPair(dlMatch[1], dlMatch[2]);
    dlCount += 1;
  }

  let liMatch: RegExpExecArray | null;
  const liRegex =
    /<li\b[^>]*>[\s\S]{0,300}?<(?:strong|b)\b[^>]*>([\s\S]{1,500}?)<\/(?:strong|b)>\s*:?\s*([\s\S]{1,1800}?)<\/li>/giu;

  let liCount = 0;

  while (
    (liMatch = liRegex.exec(html)) !== null &&
    liCount < 500
  ) {
    pushPair(liMatch[1], liMatch[2]);
    liCount += 1;
  }

  return pairs.slice(0, 600);
}

function asarvoIntentCoreV7StructuredRequirementStateFromPairs(
  requirement: UniversalRequirement,
  pairs: readonly AsarvoIntentCoreV6StructuredSpecPair[],
  allRequirements: readonly UniversalRequirement[]
): AsarvoIntentCoreV7RequirementState {
  if (pairs.length === 0) return "absent";

  const conflictProbe: UniversalRequirement =
    requirement.hard
      ? requirement
      : {
          ...requirement,
          hard: true,
        };

  let hasMatch = false;
  let hasConflict = false;

  for (const pair of pairs) {
    if (
      requirementHasEvidenceInContext(
        requirement,
        pair.evidence,
        allRequirements
      )
    ) {
      hasMatch = true;
    }

    if (
      hasConflictingHardRequirementInTitle(
        conflictProbe,
        pair.evidence,
        allRequirements
      )
    ) {
      hasConflict = true;
    }

    if (hasMatch && hasConflict) {
      return "ambiguous";
    }
  }

  if (hasMatch) return "match";
  if (hasConflict) return "conflict";
  return "absent";
}

function asarvoIntentCoreV8AllIntentRequirements(
  parsed: ParsedQuery
): UniversalRequirement[] {
  return [
    ...parsed.intent.required,
    ...parsed.intent.preferred,
    ...parsed.intent.anyOfRequired.flat(),
  ];
}

function asarvoIntentCoreV6TrimSpecHtmlAtRecommendationBoundary(
  htmlRaw: string
): string {
  const html = String(htmlRaw || "");

  const marker =
    /(?:podobne\s+produkty|produkty\s+podobne|polecane\s+produkty|inni\s+kupili|może\s+ci\s+się\s+spodobać|moze\s+ci\s+sie\s+spodobac|recommended\s+products|related\s+products|you\s+may\s+also\s+like|customers\s+also\s+bought)/iu.exec(
      html
    );

  if (
    marker &&
    typeof marker.index === "number" &&
    marker.index >= 800
  ) {
    return html.slice(0, marker.index);
  }

  return html.slice(0, 220_000);
}

function asarvoSearchCoreV19StripSiblingVariantHtmlSurfaces(
  htmlRaw: string
): string {
  let html = String(htmlRaw ?? "");
  if (!html) return "";

  const opening =
    /<(div|section|ul|ol|form|aside)\b[^>]{0,1200}>/giu;

  const removals: Array<{
    start: number;
    end: number;
  }> = [];

  let match: RegExpExecArray | null;

  while (
    (match = opening.exec(html)) !== null &&
    removals.length < 200
  ) {
    if (
      !asarvoSearchCoreV19StrongVariantUiAttribute(
        match[0]
      )
    ) {
      continue;
    }

    const tag =
      String(match[1] ?? "")
        .toLowerCase();

    const closeRe =
      new RegExp(
        `<\\/${tag}\\s*>`,
        "giu"
      );

    closeRe.lastIndex =
      opening.lastIndex;

    const close =
      closeRe.exec(html);

    const maxEnd =
      Math.min(
        html.length,
        opening.lastIndex + 40_000
      );

    const end =
      close &&
      typeof close.index === "number" &&
      close.index < maxEnd
        ? close.index + close[0].length
        : maxEnd;

    removals.push({
      start: match.index,
      end,
    });

    opening.lastIndex =
      end;
  }

  for (
    let index = removals.length - 1;
    index >= 0;
    index -= 1
  ) {
    const removal =
      removals[index];

    html =
      html.slice(0, removal.start) +
      " " +
      html.slice(removal.end);
  }

  return html;
}

function asarvoIntentCoreV6SpecPairIsSafe(
  labelRaw: string,
  valueRaw: string
): boolean {
  const label = normalizeText(labelRaw);
  const value = normalizeText(valueRaw);

  if (!label || !value) return false;

  if (
    label.length < 2 ||
    label.length > 120 ||
    value.length > 700
  ) {
    return false;
  }

  // Navigation / CTA / price rows are not product-attribute evidence.
  if (
    /\b(?:cena|price|kup\s+teraz|buy\s+now|dodaj\s+do\s+koszyka|add\s+to\s+cart|raty|leasing|dostawa|delivery|wysy[lł]ka|shipping)\b/iu.test(
      label
    )
  ) {
    return false;
  }

  // Marketing paragraphs masquerading as a "label" are unsafe.
  if (label.split(/\s+/).length > 12) return false;

  return true;
}

function asarvoSearchCoreV19StrongVariantUiAttribute(
  openingTagRaw: string
): boolean {
  const tag = String(openingTagRaw ?? "");

  return /(?:class|id|data-[\w:-]+)\s*=\s*["'][^"']{0,320}(?:(?:product[-_ ]?)?variant(?:s|[-_ ](?:selector|picker|list|options?|swatches?))?|swatches?|product[-_ ]options?|alternate[-_ ]products?|other[-_ ]variants?|sibling[-_ ]products?|colour[-_ ](?:swatch|picker|selector)|color[-_ ](?:swatch|picker|selector)|capacity[-_ ](?:picker|selector|options?)|storage[-_ ](?:picker|selector|options?)|size[-_ ](?:picker|selector|options?))[^"']*["']/iu.test(
    tag
  );
}
 return {
  cleanSpecCell: asarvoIntentCoreV6CleanSpecCell,
  extractPairs: asarvoIntentCoreV6ExtractStructuredSpecPairsFromHtml,
  requirementState: asarvoIntentCoreV7StructuredRequirementStateFromPairs,
  allRequirements: asarvoIntentCoreV8AllIntentRequirements,
  canonicalEvidence: asarvoIntentCoreV6CanonicalRequirementEvidenceFromStructuredSpecs,
  stripSiblingVariants: asarvoSearchCoreV19StripSiblingVariantHtmlSurfaces,
  trimRecommendationBoundary: asarvoIntentCoreV6TrimSpecHtmlAtRecommendationBoundary,
  isSafePair: asarvoIntentCoreV6SpecPairIsSafe
 };
}
