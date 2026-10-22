/** ASARVO v2 CORE032: isolated source recovery; NOT connected to /api/search. */
export type Requirement = {key:string; value:string; [key:string]:unknown};
export type ParsedQueryAdapter = unknown;
export type StructuredPair = unknown;
export type StructuredState = 'match' | 'conflict' | 'unknown' | string;
export type SpecDependencies = {
  normalizeText:(value:string)=>string;
  extractTagText:(html:string)=>string;
  normalizeMatchText:(value:string)=>string;
  asarvoIntentCoreV8AllIntentRequirements:(parsed:ParsedQueryAdapter)=>Requirement[];
  asarvoIntentCoreV6ExtractStructuredSpecPairsFromHtml:(html:string)=>StructuredPair[];
  asarvoIntentCoreV7StructuredRequirementStateFromPairs:(requirement:Requirement,pairs:StructuredPair[],all:Requirement[])=>StructuredState;
  universalRequirementComparison:(requirement:Requirement)=>string;
  buildCanonicalRequirementProofToken:(requirement:Requirement)=>string;
};

// Source-equivalent body; dependencies injected rather than silently reimplemented.
export function asarvoIntentCoreV6CleanSpecCell(valueRaw:string, dependencies:Pick<SpecDependencies,'normalizeText'|'extractTagText'>):string {
  const {normalizeText,extractTagText}=dependencies;
  return normalizeText(extractTagText(String(valueRaw).replace(/<br\s*\/?>/giu," ").replace(/&nbsp;/giu," "))).replace(/\s+/g," ").trim();
}

// Source-equivalent body; full production parity requires real upstream dependencies.
export function asarvoIntentCoreV6CanonicalRequirementEvidenceFromStructuredSpecs(htmlRaw:string,parsed:ParsedQueryAdapter,dependencies:SpecDependencies):string {
  const {
    normalizeText,normalizeMatchText,asarvoIntentCoreV8AllIntentRequirements,
    asarvoIntentCoreV6ExtractStructuredSpecPairsFromHtml,
    asarvoIntentCoreV7StructuredRequirementStateFromPairs,
    universalRequirementComparison,buildCanonicalRequirementProofToken
  }=dependencies;
  const allRequirements=asarvoIntentCoreV8AllIntentRequirements(parsed);
  if(allRequirements.length===0)return "";
  const pairs=asarvoIntentCoreV6ExtractStructuredSpecPairsFromHtml(htmlRaw);
  if(pairs.length===0)return "";
  const canonical:string[]=[];
  const seen=new Set<string>();
  for(const requirement of allRequirements){
    const structuredState=asarvoIntentCoreV7StructuredRequirementStateFromPairs(requirement,pairs,allRequirements);
    if(structuredState!=="match")continue;
    const id=[requirement.key,universalRequirementComparison(requirement),normalizeMatchText(requirement.value)].join(":");
    if(seen.has(id))continue;
    seen.add(id);
    canonical.push(buildCanonicalRequirementProofToken(requirement));
  }
  return normalizeText(canonical.join(" ")).slice(0,8000);
}
