/** CORE049: offer-local spec evidence safety. Pure logic, not wired to API. */
export type SpecPair = {label:string;value:string;evidence:string};
export type OfferLocalCheck = {eligible:boolean;reason:'ok'|'missing_identity'|'variant_conflict'|'empty_specs'|'blocked_page';pairs:SpecPair[]};
const norm=(s:string)=>String(s??'').normalize('NFKC').toLocaleLowerCase('pl').replace(/\s+/g,' ').trim();
function storageTokens(s:string):Set<string>{
 const set=new Set<string>();const re=/(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/giu;let m:RegExpExecArray|null;
 while((m=re.exec(norm(s)))!==null){let v=Number(m[1].replace(',','.'));if(Number.isFinite(v)){if(m[2].toLowerCase()==='tb')v*=1000;set.add(String(Math.round(v)));}}
 return set;
}
export function checkOfferLocalSpecEvidence(args:{requestedTitle:string;offerTitle:string;html:string;extractPairs:(html:string)=>SpecPair[];blockedPage?:(html:string)=>boolean}):OfferLocalCheck{
 const {requestedTitle,offerTitle,html,extractPairs,blockedPage}=args;
 if(!norm(requestedTitle)||!norm(offerTitle))return {eligible:false,reason:'missing_identity',pairs:[]};
 if(!html||blockedPage?.(html))return {eligible:false,reason:'blocked_page',pairs:[]};
 const requested=storageTokens(requestedTitle),offered=storageTokens(offerTitle);
 if(requested.size>0&&offered.size>0&&![...requested].some(x=>offered.has(x)))return {eligible:false,reason:'variant_conflict',pairs:[]};
 // This gate NEVER treats offer-title similarity as evidence. Product identity MUST be confirmed upstream.
 // Only the supplied, verified offer-local HTML enters extraction; do not concatenate sibling offers.
 const pairs=extractPairs(html);
 if(!pairs.length)return {eligible:false,reason:'empty_specs',pairs:[]};
 return {eligible:true,reason:'ok',pairs};
}
