"use strict";
const assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),Module=require('node:module');
const file='lib/asarvo/core062-diversity.ts';
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(js,file);
const f=m.exports.diversifyVerifiedOffers;
const make=(h,id)=>({id,url:'https://'+h+'/p/'+id});
const a=[make('a.pl',1),make('a.pl',2),make('a.pl',3),make('a.pl',4),make('a.pl',5),make('b.pl',6),make('c.pl',7)];
const tests=[
 ['empty',()=>assert.deepEqual(f([]),[])],
 ['pinned top 3',()=>assert.deepEqual(f(a).slice(0,3),a.slice(0,3))],
 ['no offer lost',()=>assert.deepEqual(f(a).map(x=>x.id).sort(),a.map(x=>x.id).sort())],
 ['no fabricated',()=>assert.equal(f(a).every(x=>a.includes(x)),true)],
 ['round robin tail',()=>assert.deepEqual(f(a).slice(3).map(x=>x.id),[6,7,4,5])],
 ['single host stable',()=>{const v=a.slice(0,5);assert.deepEqual(f(v),v)}],
 ['four stable',()=>assert.deepEqual(f(a.slice(0,4)),a.slice(0,4))],
 ['invalid URL preserved',()=>{const v=[...a,{id:8,url:'javascript:bad'}];assert.equal(f(v).length,v.length)}],
 ['identical references',()=>assert.equal(f(a)[0],a[0])],
 ['deterministic',()=>assert.deepEqual(f(a),f(a))]
];
tests.push(
 ['new host ahead of pinned host in tail',()=>assert.deepEqual(f(a).slice(3).map(x=>x.id),[6,7,4,5])],
 ['no drop with repeated host',()=>{const v=[...a,make('a.pl',8),make('c.pl',9)];assert.deepEqual(f(v).map(x=>x.id).sort((x,y)=>x-y),v.map(x=>x.id).sort((x,y)=>x-y))}],
 ['stable within-host ordering',()=>{const v=[...a,make('b.pl',8),make('b.pl',9)];assert.deepEqual(f(v).filter(x=>x.url.includes('b.pl')).map(x=>x.id),[6,8,9])}],
);
for(const [name,fn] of tests){fn();console.log('PASS '+name)}
console.log('CORE062_LANE2_TESTS='+tests.length);
