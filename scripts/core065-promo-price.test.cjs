'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const raw=fs.readFileSync('lib/asarvo/core065-promo-price.ts','utf8');
const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('module','exports','require',js)(mod,mod.exports,require);
const {core065PromoPriceDecision:d,filterCore065PromotionMisprices:f}=mod.exports;
const title='Rower elektryczny INDIANA E-Trekking 3.0 | Nawet 500 zł na kolejne zakupy! | Do 40 rat 0%';
const cases=[
 ['reject promo price',d(title,500).suspect,true],
 ['accept real price',d(title,5999.99).suspect,false],
 ['no bonus',d('Rower elektryczny Indiana 500 zł',500).suspect,false],
 ['no title',d(null,500).suspect,false],
 ['no price',d(title,null).suspect,false],
 ['unrelated amount',d('Rower elektryczny | Nawet 300 zł na kolejne zakupy',500).suspect,false],
 ['next purchases',d('Laptop Lenovo - do 150 zł na następne zakupy',150).suspect,true],
 ['old price not bonus',d('Rower elektryczny - rabat 500 zł',500).suspect,false],
 ['cheap category do not reject',d('Słuchawki - nawet 50 zł na kolejne zakupy',50).suspect,false],
 ['decimal comma',d('Pralka Bosch - nawet 500,50 zł na kolejne zakupy',500.50).suspect,true],
 ['reject one keep one',f([{name:title,price:500},{name:title,price:5999.99}]).rejected,1],
 ['missing-price not changed',f([{name:title,price:null}]).offers.length,1],
];for(const [name,actual,expected] of cases){assert.equal(actual,expected,name);console.log('PASS '+name)};
console.log('CORE065_PRICE_TESTS=12');
