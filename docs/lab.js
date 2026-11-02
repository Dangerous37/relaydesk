const el=id=>document.getElementById(id);
const storage='relaydesk-lab-run-v1';
const fresh=()=>({id:crypto.randomUUID(),step:0,guard:true,effects:0,trace:[]});
let run=JSON.parse(sessionStorage.getItem(storage) || 'null') || fresh();
let busy=false;
const actions=['Queue booking','Deliver & inject crash','Restart worker & retry','Experiment complete'];
const hints=['Start with one synthetic booking.','The next delivery commits at the receiver, then discards the worker acknowledgment.',
  'The booking exists downstream. The queue still shows it as pending. Reload this tab or restart the worker.',
  'Compare the HTTP responses and effect count. Start a new experiment to change the receiver policy.'];
function render(){
  el('intake').textContent=run.step?'Accepted':'Ready';
  el('worker').textContent=['Idle','Pending','Crashed · pending','Acknowledged'][run.step];
  el('receiver').textContent=run.effects?run.effects+' created':'No effect';
  el('effects').textContent=String(run.effects).padStart(2,'0');
  el('guard').checked=run.guard;el('guard').disabled=busy || run.step>0;
  el('action').textContent=actions[run.step];el('action').disabled=busy || run.step===3;
  el('reset').disabled=busy;el('hint').textContent=hints[run.step];
  el('count').textContent=run.trace.length+' records';
  el('trace').replaceChildren(...run.trace.map(([stage,note],i)=>{
    const li=document.createElement('li');
    for(const [tag,value] of [['span',String(i+1).padStart(2,'0')],['b',stage],['span',note]]){
      const node=document.createElement(tag);node.textContent=value;li.append(node);
    }
    return li;
  }));
  if(!run.trace.length){const li=document.createElement('li');li.textContent='Awaiting intake';li.style.display='block';el('trace').append(li);}
}
function save(){sessionStorage.setItem(storage,JSON.stringify(run));}
el('guard').onchange=()=>{run.guard=el('guard').checked;save();};
el('reset').onclick=()=>{run=fresh();save();render();};
el('action').onclick=async()=>{
  if(busy || run.step>=3)return;
  busy=true;render();
  let error;
  try{
    if(run.step===0){run.trace.push(['INTAKE','Synthetic booking queued with stable key '+run.id.slice(0,8)+'.']);}
    else {
      const response=await fetch('./receiver',{method:'POST',headers:{'Idempotency-Key':run.id,'X-Lab-Deduplicate':run.guard?'on':'off'}});
      if(!response.ok)throw new Error('Receiver returned HTTP '+response.status);
      const receipt=await response.json();run.effects=receipt.effects;
      run.trace.push(['RECEIVER','HTTP '+response.status+' · '+(receipt.duplicate?'Existing receipt returned.':'New booking committed.')]);
      run.trace.push(run.step===1?['FAULT','Crash injected before queue acknowledgment.']:['WORKER','Retried with the same key and saved acknowledgment.']);
    }
    run.step++;save();
  }catch(e){error='Could not complete delivery. '+e.message;}
  finally{busy=false;render();if(error)el('hint').textContent=error;}
};
try{
  await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  save();render();
}catch{el('hint').textContent='This lab requires HTTPS or localhost and browser storage.';}
