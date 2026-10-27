import test from 'node:test';
import assert from 'node:assert/strict';
import {readChats} from './state.mjs';
import {readTasks,advanceTasks,agentStatus} from './task-state.mjs';
test('invalid browser storage does not crash either mode',()=>{globalThis.localStorage={getItem:()=>'{broken'};assert.deepEqual(readChats(),[]);assert.deepEqual(readTasks(),[])});
test('interrupted Cowork runs resume paused after reload',()=>{globalThis.localStorage={getItem:()=>JSON.stringify([{id:'a',title:'Test',prompt:'Task',status:'running',step:2}])};const [task]=readTasks();assert.equal(task.status,'paused');assert.equal(task.step,2);assert.deepEqual(task.notes,[])});
test('task progress requires approval before completion',()=>{let tasks=[{id:'a',status:'running',step:0},{id:'b',status:'paused',step:1}];for(let i=0;i<6;i++)tasks=advanceTasks(tasks);assert.equal(tasks[0].status,'review');assert.equal(tasks[0].step,4);assert.equal(tasks[1].step,1);assert.equal(agentStatus(tasks[0],3),'waiting_review');assert.equal(agentStatus(tasks[0],2),'completed')});
test('denied or completed tasks never advance again',()=>{const tasks=[{status:'denied',step:4},{status:'done',step:4}];assert.deepEqual(advanceTasks(tasks),tasks)});
