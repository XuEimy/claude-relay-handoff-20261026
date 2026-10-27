import test from 'node:test';import assert from 'node:assert/strict';import {loadSessions,appendUserMessage,saveSessions,SESSION_KEY} from './session-store.mjs';
const storage=x=>({getItem:k=>x[k]??null});
test('migrates user content without task progress or invented files',()=>{const s=loadSessions(storage({'kelaodeyun.web.chats.v1':JSON.stringify([{id:'a',title:'chat',messages:[{role:'user',text:'hello'},{role:'assistant',text:'answer',tool:'allowed'}]}]),'kelaodeyun.ui.tasks.v1':JSON.stringify([{id:'a',title:'work',prompt:'first',notes:['second'],status:'done',step:4}])}));assert.equal(s.length,2);assert.notEqual(s[0].id,s[1].id);assert.deepEqual(s[1].messages.map(m=>m.text),['first','second']);assert.equal(s[1].channel,'cowork');assert.equal(s[1].step,undefined);assert.equal(s[0].messages[1].tool,undefined)});
test('does not resurrect legacy sessions after current store is empty',()=>assert.deepEqual(loadSessions(storage({[SESSION_KEY]:'[]','kelaodeyun.ui.tasks.v1':'[{"id":"a","prompt":"old"}]'})),[]));
test('same conversation accepts followups, attachments and retains its channel',()=>{const first=appendUserMessage(null,{text:'start',channel:'cowork',model:'Opus'},'same');const next=appendUserMessage(first,{text:'continue',files:[{name:'brief.txt'}],channel:'chat',model:'Sonnet'});assert.equal(next.id,'same');assert.equal(next.channel,'cowork');assert.equal(next.title,'start');assert.deepEqual(next.messages.map(m=>m.text),['start','continue']);assert.deepEqual(next.messages[1].files,['brief.txt']);assert.equal(next.messages.length,2);assert.equal(next.connection,'offline')});
test('invalid legacy data cannot crash startup',()=>assert.deepEqual(loadSessions(storage({'kelaodeyun.web.chats.v1':'not-json','kelaodeyun.ui.tasks.v1':'[null,2,{}]'})),[]));

test('storage failure is reported without pretending to save', () => {
  assert.equal(saveSessions({setItem(){throw new Error('quota');}}, []), false);
  const data={};
  assert.equal(saveSessions({setItem(k,v){data[k]=v;}}, [{id:'a',title:'saved'}]), true);
  assert.deepEqual(JSON.parse(data[SESSION_KEY]), [{id:'a',title:'saved'}]);
});
