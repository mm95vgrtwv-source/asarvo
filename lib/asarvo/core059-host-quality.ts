/** CORE059: bounded post-verification diagnostics, never mutates offers. */
export type HostQualityOffer={url?:string;price?:number|null;totalPrice?:number|null};
export function summarizeHostQuality(offers: readonly HostQualityOffer[]) {
  const hosts=new Map<string,{offers:number;priced:number;unpriced:number}>();
  let rejectedUnsafeUrl=0;
  for(const offer of offers){
    let host='';
    try{const u=new URL(offer.url??'');if(u.protocol!=='https:'||u.username||u.password||!u.hostname)throw Error('bad-url');host=u.hostname.toLowerCase()}catch{rejectedUnsafeUrl++;continue}
    const row=hosts.get(host)??{offers:0,priced:0,unpriced:0};row.offers++;
    const p=offer.totalPrice??offer.price;
    if(typeof p==='number' && Number.isFinite(p) && p>0)row.priced++;else row.unpriced++;
    hosts.set(host,row);
  }
  return {offerCount:offers.length,rejectedUnsafeUrl,hostCount:hosts.size,hosts:[...hosts.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(0,40).map(([host,counts])=>({host,...counts}))};
}
