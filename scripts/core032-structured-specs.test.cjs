'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const ts=require('typescript');
const file=path.join(__dirname,'..','lib','asarvo','legacy-structured-specs.ts');
const transpiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(transpiled.outputText,file);
const {asarvoIntentCoreV6CleanSpecCell:clean,asarvoIntentCoreV6CanonicalRequirementEvidenceFromStructuredSpecs:proof}=m.exports;
let count=0; const check=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const normalizeText=s=>s.replace(/\s+/g,' ').trim();
const extractTagText=s=>s.replace(/<[^>]*>/g,' ');
check('HTML break and nbsp stripped',()=>assert.equal(clean('  16<br/>GB&nbsp; RAM  ',{normalizeText,extractTagText}),'16 GB RAM'));
check('spec plain text preserved',()=>assert.equal(clean('SSD 990 PRO 2TB',{normalizeText,extractTagText}),'SSD 990 PRO 2TB'));
check('spec empty input',()=>assert.equal(clean('',{normalizeText,extractTagText}),''));
const req=[{key:'storage',value:'2 TB'},{key:'color',value:'black'},{key:'storage',value:'2 TB'}];
let proofCalls=0;
const dep={normalizeText,extractTagText,normalizeMatchText:s=>s.toLowerCase().trim(),
 asarvoIntentCoreV8AllIntentRequirements:()=>req,
 asarvoIntentCoreV6ExtractStructuredSpecPairsFromHtml:s=>s?['pair']:[],
 asarvoIntentCoreV7StructuredRequirementStateFromPairs:r=>r.key==='color'?'conflict':'match',
 universalRequirementComparison:r=>r.value,
 buildCanonicalRequirementProofToken:r=>{proofCalls++;return `[${r.key}=${r.value}]`}};
check('matching structured proof only',()=>assert.equal(proof('<table/>',{},dep),'[storage=2 TB]'));
check('duplicate proof removed',()=>assert.equal(proofCalls,1));
check('no requirements fail closed',()=>assert.equal(proof('x',{}, {...dep,asarvoIntentCoreV8AllIntentRequirements:()=>[]}),''));
check('no pairs fail closed',()=>assert.equal(proof('',{},dep),''));
check('conflicts never become proof',()=>assert.equal(proof('x',{}, {...dep,asarvoIntentCoreV7StructuredRequirementStateFromPairs:()=> 'conflict'}),''));
check('bounded 8000 chars',()=>assert.equal(proof('x',{}, {...dep,buildCanonicalRequirementProofToken:()=> 'z'.repeat(9000)}).length,8000));
console.log(`ASARVO_CORE032_UNIT_PASS=${count}`);
