'use strict';
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function validateBackup(input) {
  const fail = message => { throw new Error(message); };
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const text = x => typeof x === 'string';
  const amount = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER;
  const count = x => amount(x) && Number.isSafeInteger(x);
  if (!object(input)) fail('Formato de backup incompatível.');
  let data = structuredClone(input);
  if ('format' in data) {
    if (data.format !== '2r-refeicoes' || data.version !== 1) fail('Versão de backup incompatível.');
    data = data.data;
    if (!object(data)) fail('Backup sem dados.');
  }
  if ('projects' in data) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month) || !Array.isArray(data.projects) || !Array.isArray(data.events)) fail('Estrutura do backup incompatível.');
    const [year, month] = data.month.split('-').map(Number);
    const days = new Date(year, month, 0).getDate();
    const ids = new Set();
    const rows = data.projects.map(p => {
      if (!object(p) || !text(p.id) || !p.id || ids.has(p.id) || !text(p.company) || !text(p.name) || !text(p.product) || !amount(p.price)) fail('Cadastro de obra inválido ou duplicado.');
      ids.add(p.id);
      return {id:p.id, empresa:p.company, obra:p.name, producao:p.product, preco:p.price, dias:Array.from({length:days},()=>[0,0,0,0])};
    });
    const byId = new Map(rows.map(r=>[r.id,r]));
    function checkEvents(events, n, apply) {
      if (!Array.isArray(events)) fail('Lista de lançamentos inválida.');
      const seen = new Set();
      for (const e of events) {
        if (!object(e) || !byId.has(e.projectId) || !Number.isInteger(e.day) || e.day < 1 || e.day > n || !['almoco','jantar'].includes(e.meal) || !count(e.production) || !count(e.admin)) fail('Lançamento inválido: obra, dia, refeição ou quantidade incompatível.');
        const key = JSON.stringify([e.projectId,e.day,e.meal]);
        if (seen.has(key)) fail('Lançamento duplicado no backup.');
        seen.add(key);
        if (apply) { const d=byId.get(e.projectId).dias[e.day-1], offset=e.meal==='almoco'?0:2; d[offset]=e.production; d[offset+1]=e.admin; }
      }
    }
    checkEvents(data.events,days,true);
    if ('eventsByMonth' in data) {
      if (!object(data.eventsByMonth)) fail('Histórico mensal inválido.');
      for (const [key,events] of Object.entries(data.eventsByMonth)) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) fail('Mês do histórico inválido.');
        const [y,m]=key.split('-').map(Number);
        checkEvents(events,new Date(y,m,0).getDate(),false);
        if (key===data.month) {
          const canonical=es=>JSON.stringify(es.map(e=>[e.projectId,e.day,e.meal,e.production,e.admin]).sort());
          if (canonical(events)!==canonical(data.events)) fail('O histórico e os lançamentos do mês divergem.');
        }
      }
    }
    if ('projectOrder' in data) {
      if (!Array.isArray(data.projectOrder) || data.projectOrder.length!==ids.size || new Set(data.projectOrder).size!==ids.size || data.projectOrder.some(id=>!ids.has(id))) fail('Ordem das obras inválida.');
      rows.sort((a,b)=>data.projectOrder.indexOf(a.id)-data.projectOrder.indexOf(b.id));
    }
    data = {mes:MONTHS[month-1],ano:year,dias:days,rows,sourceBackup:data};
  }
  if (!MONTHS.includes(data.mes) || !Number.isInteger(data.ano) || data.ano<1900 || data.ano>9999 || data.dias!==new Date(data.ano,MONTHS.indexOf(data.mes)+1,0).getDate() || !Array.isArray(data.rows)) fail('Período ou estrutura do backup inválido.');
  for (const r of data.rows) {
    if (!object(r) || !text(r.empresa) || !text(r.obra) || !text(r.producao) || !amount(r.preco) || !Array.isArray(r.dias) || r.dias.length!==data.dias || r.dias.some(d=>!Array.isArray(d)||d.length!==4||d.some(v=>!count(v)))) fail('Obra, preço ou quantidade inválida no backup.');
  }
  const total=data.rows.reduce((a,r)=>a+r.dias.flat().reduce((x,y)=>x+y,0),0);
  const revenue=data.rows.reduce((a,r)=>a+r.dias.flat().reduce((x,y)=>x+y,0)*r.preco,0);
  if (!Number.isSafeInteger(total) || !amount(revenue)) fail('Totais do backup excedem o limite suportado.');
  return data;
}
function backupPayload(state) { return {format:'2r-refeicoes',version:1,exportedAt:new Date().toISOString(),data:validateBackup(state)}; }
// A single localStorage write is atomic: failed writes leave the previous value intact.
function persistReplacement(storage,key,candidate) {
  const validated=validateBackup(candidate);
  storage.setItem(key,JSON.stringify(validated));
  return validated;
}
