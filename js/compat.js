// Some viewers swap blob: URLs for a "blob-request://" scheme that fetch() cannot read, so every embedded texture failed to load (black-and-white scene).
// Remember the Blob behind each object URL and hand it straight back when fetch() asks for it.
(function(){try{const M=new Map(),cu=URL.createObjectURL.bind(URL),ru=URL.revokeObjectURL.bind(URL),f=window.fetch.bind(window);
URL.createObjectURL=function(b){const u=cu(b);if(b instanceof Blob)M.set(u,b);return u};
URL.revokeObjectURL=function(u){M.delete(u);return ru(u)};
window.fetch=function(u,o){const k=typeof u==='string'?u:(u&&u.url),b=k&&M.get(k);return b?Promise.resolve(new Response(b,{status:200,headers:{'Content-Type':b.type||'application/octet-stream'}})):f(u,o)}}catch(e){}})();
// the models live in assets/models/*.js and register themselves on window.TLF_DATA
function takeData(id){const k=id.slice(2),v=TLF_DATA[k];delete TLF_DATA[k];return v}
