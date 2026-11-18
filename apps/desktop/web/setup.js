const el=id=>document.getElementById(id);
let state=null,busy=false;
function render(){
 el('status').textContent=state?.message||'Comprobando Docker…';
 el('led').classList.toggle('ready',!!state?.ready);
 el('docker-help').hidden=!state||state.docker;
 el('account').hidden=!!state?.hasAccount;
 el('start').textContent=state?.hasAccount?'Iniciar servidor':'Preparar mi CRM';
 el('start').hidden=!!state?.ready;
 el('start').disabled=busy||!state?.docker;
 el('stop').hidden=!state?.running;
 el('open').hidden=!state?.ready;
 el('address').textContent=state?.url?`Dirección local: ${state.url}`:'';
 document.querySelectorAll('button,input').forEach(x=>{if(x.id!=='start')x.disabled=busy;});
}
window.receiveProgress=message=>{el('progress').hidden=false;el('progress').textContent=message;};
async function perform(action,extra={}){
 if(busy)return; busy=true;el('error').textContent='';render();
 receiveProgress(action==='status'?'Comprobando el servidor…':action==='stop'?'Deteniendo sin borrar tus datos…':'Preparando…');
 try{
  const result=await window.__TAURI_INTERNALS__.invoke('setup_action',{action,password:null,url:null,allowLocalHttp:null,...extra});
  if(!result.opened)state=result;
 }catch(error){el('error').textContent=String(error);}
 finally{busy=false;el('progress').hidden=true;render();}
}
for(const mode of ['local','remote'])el(`${mode}-tab`).onclick=()=>{
 for(const value of ['local','remote']){el(`${value}-panel`).hidden=value!==mode;el(`${value}-tab`).setAttribute('aria-selected',String(value===mode));}
};
el('install').onsubmit=event=>{
 event.preventDefault();const password=el('password').value;
 if(!state?.hasAccount&&(password.length<12||password.length>128||password!==el('repeat').value)){el('error').textContent='Escribe la misma contraseña de 12 a 128 caracteres en ambos campos.';return;}
 el('password').value='';el('repeat').value='';perform('start',{password});
};
el('connect').onsubmit=event=>{event.preventDefault();perform('connect',{url:el('server').value.trim(),allowLocalHttp:el('http').checked});};
el('docker-download').onclick=()=>perform('docker-download');
el('check').onclick=()=>perform('status');el('open').onclick=()=>perform('open-local');
el('stop').onclick=()=>{if(confirm('¿Detener el servidor? Se cerrarán las conexiones a este Nexo. Tus datos se conservarán.'))perform('stop');};
perform('status');
