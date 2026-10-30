'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file='lib/asarvo/core059-host-quality.ts',js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(js,file);const summarize=m.exports.summarizeHostQuality;
const tests=[
 ['empty',[],r=>r.hostCount===0&&r.offerCount===0],
 ['one host',[{url:'https://a.pl/p/1',price:100}],r=>r.hostCount===1&&r.hosts[0].priced===1],
 ['duplicate host',[{url:'https://a.pl/a',price:1},{url:'https://a.pl/b',price:2}],r=>r.hosts[0].offers===2],
 ['missing price',[{url:'https://a.pl/a'}],r=>r.hosts[0].unpriced===1],
 ['invalid price',[{url:'https://a.pl/a',price:-1}],r=>r.hosts[0].unpriced===1],
 ['prefer total',[{url:'https://a.pl/a',price:100,totalPrice:120}],r=>r.hosts[0].priced===1],
 ['reject http',[{url:'http://a.pl/a',price:2}],r=>r.rejectedUnsafeUrl===1],
 ['reject credentials',[{url:'https://u:p@a.pl/p',price:2}],r=>r.rejectedUnsafeUrl===1],
 ['invalid url',[{url:'javascript:alert(1)',price:2}],r=>r.rejectedUnsafeUrl===1],
 ['two hosts',[{url:'https://a.pl/p',price:1},{url:'https://b.pl/p',price:2}],r=>r.hostCount===2],
];
for(const [name,offers,pred] of tests){assert.ok(pred(summarize(offers)),name);console.log('PASS '+name)}
console.log('CORE059_LANE2_TESTS='+tests.length);
