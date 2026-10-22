"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const file = path.join(__dirname, "..", "lib", "asarvo", "legacy-stability.ts");
const code = fs.readFileSync(file, "utf8");
const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const m = new Module(file, module);
m.filename = file;
m.paths = module.paths;
m._compile(compiled.outputText, file);
const { normalizeAsarvoStabilityOfferUrl: normalize, asarvoStabilityV3DedupeAndRank: rank } = m.exports;
let checks = 0;
function check(label, fn) { fn(); checks++; console.log("PASS " + label); }
const mk = (url, price, dealScore = 50, riskScore = 40) => ({ url, price, totalPrice: price, dealScore, riskScore, sourceConfidence: 50 });
check("tracking stripped; actual variant preserved", () => {
  assert.equal(normalize("https://Example.com/offer/?variant=2&utm_source=x#hi"), "https://example.com/offer?variant=2");
});
check("two different variants are kept", () => {
  assert.equal(rank([mk("https://shop.pl/p?size=1",100), mk("https://shop.pl/p?size=2",110)]).length,2);
});
check("same URL tracking variant deduplicated", () => {
  const result=rank([mk("https://shop.pl/p?utm_source=x",200),mk("https://shop.pl/p",150)]);
  assert.equal(result.length,1);
  assert.equal(result[0].price,150);
});
check("best cheapest safest badges are unique", () => {
  const result=rank([mk("https://shop.pl/a",200,95,80),mk("https://shop.pl/b",90,60,15),mk("https://shop.pl/c",150,80,40)]);
  for (const key of ["bestOffer","cheapestOffer","safestOffer"]) assert.equal(result.filter(x=>x[key]===true).length,1);
  assert.equal(result.find(x=>x.cheapestOffer).url,"https://shop.pl/b");
});
check("input remains unchanged", () => {
  const original=[mk("https://shop.pl/a",100),mk("https://shop.pl/b",200)];
  const copy=JSON.stringify(original);
  rank(original);
  assert.equal(JSON.stringify(original),copy);
});
check("deterministic ordering", () => {
  const originals=[mk("https://shop.pl/a",130),mk("https://shop.pl/b",120),mk("https://shop.pl/c",100)];
  assert.deepEqual(rank(originals),rank([...originals].reverse()));
});
console.log(`ASARVO_CORE016_UNIT_PASS=${checks}`);
