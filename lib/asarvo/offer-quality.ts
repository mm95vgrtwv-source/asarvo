/** CORE050: fail-closed price/URL validation helpers; not wired to API. */
export type QualityOffer={name?:string;url?:string;price?:number|null;totalPrice?:number|null};
export type QualityAssessment={priced:boolean;safeUrl:boolean;price:number|null;reason:'ok'|'missing_price'|'invalid_price'|'unsafe_url'};
export function assessOfferQuality(offer:QualityOffer):QualityAssessment{
 let safeUrl=false;
 try{const u=new URL(offer.url??'');safeUrl=u.protocol==='https:'&&Boolean(u.hostname)&&!u.username&&!u.password;}catch{}
 if(!safeUrl)return {priced:false,safeUrl:false,price:null,reason:'unsafe_url'};
 const p=offer.totalPrice??offer.price;
 if(p===null||p===undefined)return {priced:false,safeUrl:true,price:null,reason:'missing_price'};
 if(typeof p!=='number'||!Number.isFinite(p)||p<=0)return {priced:false,safeUrl:true,price:null,reason:'invalid_price'};
 return {priced:true,safeUrl:true,price:p,reason:'ok'};
}
export function qualityCounts(offers:readonly QualityOffer[]){
 const counts={total:0,priced:0,missingPrice:0,invalidPrice:0,unsafeUrl:0,uniqueHttpsHosts:0};const hosts=new Set<string>();
 for(const o of offers){counts.total++;const a=assessOfferQuality(o);if(a.priced)counts.priced++;
 if(a.reason==='missing_price')counts.missingPrice++;if(a.reason==='invalid_price')counts.invalidPrice++;if(a.reason==='unsafe_url')counts.unsafeUrl++;
 if(a.safeUrl)hosts.add(new URL(o.url!).hostname.toLowerCase());}
 counts.uniqueHttpsHosts=hosts.size;return counts;
}
