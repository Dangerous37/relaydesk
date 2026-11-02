// The downstream receipt is committed independently of the page's queue state.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const endpoint = new URL('receiver', self.registration.scope).href;
self.addEventListener('fetch', event => {
  if (event.request.url === endpoint && event.request.method === 'POST') {
    event.respondWith(receive(event.request).catch(() => new Response('Storage unavailable', {status:503})));
  }
});
async function receive(request) {
  const key=request.headers.get('Idempotency-Key');
  if (!/^[a-f0-9-]{36}$/.test(key || '')) return new Response('Invalid key',{status:400});
  const deduplicate=request.headers.get('X-Lab-Deduplicate')==='on';
  const db=await new Promise((resolve,reject)=>{
    const open=indexedDB.open('relaydesk-lab-v1',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('receipts');
    open.onsuccess=()=>resolve(open.result);
    open.onerror=()=>reject(open.error);
  });
  try {
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction('receipts','readwrite'), table=tx.objectStore('receipts'), read=table.get(key);
      let receipt;
      read.onsuccess=()=>{
        const previous=read.result || 0;
        const duplicate=deduplicate && previous>0;
        receipt={effects:duplicate ? previous : previous+1,duplicate};
        table.put(receipt.effects,key);
      };
      tx.oncomplete=()=>resolve(receipt);
      tx.onabort=()=>reject(tx.error);
    });
    return Response.json(result,{status:result.duplicate ? 200 : 201});
  } finally {db.close();}
}
