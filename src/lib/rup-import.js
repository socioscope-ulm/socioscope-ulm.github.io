/* Import RUP pour Socioscope ULM. Aucun champ d'adresse personnelle n'est conservé. */
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const field = (obj, ...aliases) => {
  const index = new Map(Object.entries(obj).map(([k,v]) => [normalize(k),v]));
  for (const name of aliases) { const v=index.get(normalize(name)); if(v!==undefined && v!==null && String(v).trim()!=='') return v; }
  return null;
};
function dateISO(value) {
  if (value instanceof Date && !isNaN(value)) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  if (typeof value === 'number' && value > 10000 && value < 100000) {
    const date=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000);
    return date.toISOString().slice(0,10);
  }
  const s=String(value??'').trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return validDate(m[0]) ? m[0] : null;
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if(m){const iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; return validDate(iso)?iso:null;}
  return null;
}
function validDate(iso){const d=new Date(`${iso}T00:00:00Z`);return !isNaN(d) && d.toISOString().slice(0,10)===iso;}
function extractYear(name){const m=String(name).match(/20(?:1\d|2\d)/);return m?Number(m[0]):null;}
function parseRow(row, source, year){
  const nni=String(field(row,'NNI')??'').trim().toUpperCase();
  if(!nni) return null;
  // Liste blanche stricte : les autres colonnes du RUP, notamment adresses,
  // coordonnées privées et codes postaux de domicile, sont ignorées.
  return {
    nni,
    contrat:String(field(row,'Numéro contrat','N° de contrat','Numero de contrat')??'').trim(),
    nom:String(field(row,'Nom')??'').trim(),
    prenom:String(field(row,'Prénom','Prenom')??'').trim(),
    entreeIEG:dateISO(field(row,'Date entrée IEG',"Date d'entrée dans les IEG")),
    entreeUnite:dateISO(field(row,"Date d'entrée dans l'UM","Entrée dans l'Etablissement")),
    entreeUO:dateISO(field(row,"Date d'entrée dans l'UO",'Entrée dans la DUM')),
    agence:String(field(row,'DUM (libellé)')??'').trim(),
    service:String(field(row,'UO (libellé)')??'').trim(),
    metier:String(field(row,'Métier (libellé)')??'').trim(),
    emploi:String(field(row,'Emploi (libellé)','Emploi')??'').trim(),
    college:String(field(row,'Collège (libellé)','Collège')??'').trim(),
    m3e:String(field(row,'Position M3E (code)','Position M3E')??'').trim(),
    lieuTravailCode:String(field(row,'Lieu de travail (code)','Etablissement (Code)')??'').trim(),
    typeContrat:String(field(row,'Type contrat (libellé)','Type de contrat')??'').trim(),
    annee:year,source
  };
}
export function readRupWorkbook(buffer, filename, XLSX){
  const wb=XLSX.read(buffer,{type:'array',cellDates:true});
  const year=extractYear(filename);
  const records=[];
  for(const sheetName of wb.SheetNames){
    const raw=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null});
    const headerIndex=raw.findIndex(row=>Array.isArray(row)&&row.some(c=>normalize(c)==='nni')&&row.some(c=>['date entree ieg','date d entree dans les ieg'].includes(normalize(c))));
    if(headerIndex<0)continue;
    const headers=raw[headerIndex];
    for(const vals of raw.slice(headerIndex+1)){
      const row=Object.fromEntries(headers.map((h,i)=>[String(h??`col${i}`),vals[i]]));
      const parsed=parseRow(row,filename,year);if(parsed)records.push({...parsed,row:raw.indexOf(vals)+1,sheet:sheetName});
    }
  }
  if(!records.length)throw new Error(`Aucune ligne RUP exploitable dans ${filename}`);
  return records;
}
export function consolidateRup(records){
  const byAgent=new Map();
  for(const r of records){
    const key=`${r.nni}||${r.contrat}`;
    if(!byAgent.has(key))byAgent.set(key,[]);
    byAgent.get(key).push(r);
  }
  const agents=[],conflicts=[];
  for(const [key,history] of byAgent){
    history.sort((a,b)=>(a.annee??0)-(b.annee??0)||a.source.localeCompare(b.source));
    const current=history.at(-1);
    const withDate=history.filter(r=>r.entreeIEG);
    const dates=[...new Set(withDate.map(r=>r.entreeIEG))].sort();
    const latestDate=withDate.at(-1)?.entreeIEG??null;
    const quality=dates.length>1?'a_verifier':latestDate?'confirmee':'manquante';
    if(dates.length>1) conflicts.push({nni:current.nni,contrat:current.contrat,dates,sources:withDate.map(x=>x.source)});
    agents.push({...current,entreeIEG:latestDate,qualiteDateIEG:quality,anneesObservees:[...new Set(history.map(r=>r.annee))]});
  }
  return {agents,history:records,conflicts,stats:{lignes:records.length,agents:agents.length,datesIEG:agents.filter(a=>a.entreeIEG).length,datesContradictoires:conflicts.length}};
}
export function ancienneteIEG(entreeIEG,atDate){
  if(!entreeIEG)return null;
  const start=new Date(`${entreeIEG}T00:00:00Z`);
  const end=new Date(`${atDate}T00:00:00Z`);
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<start)return null;
  let years=end.getUTCFullYear()-start.getUTCFullYear();
  const anniversary=new Date(Date.UTC(end.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()));
  if(end<anniversary)years--;
  return years;
}
export function enrichirAgents(agentsSocioscope,rupConsolide,dateReference){
  const byNNI=new Map();
  for(const r of rupConsolide.agents){
    if(!byNNI.has(r.nni))byNNI.set(r.nni,[]);
    byNNI.get(r.nni).push(r);
  }
  return agentsSocioscope.map(agent=>{
    const nni=String(agent.nni??agent.NNI??'').trim().toUpperCase();
    const candidates=byNNI.get(nni)??[];
    const contract=String(agent.contrat??agent.numeroContrat??'').trim();
    const matches=contract?candidates.filter(r=>r.contrat===contract):candidates;
    if(matches.length!==1)return {...agent,rapprochementRUP:matches.length?'ambigu':'absent'};
    const r=matches[0];
    const valid=r.qualiteDateIEG==='confirmee';
    return {...agent,rapprochementRUP:'identifie',dateEntreeIEG:valid?r.entreeIEG:null,
      dateEntreeIEGAControler:valid?null:r.entreeIEG,
      ancienneteIEG:valid?ancienneteIEG(r.entreeIEG,dateReference):null,
      qualiteDateIEG:r.qualiteDateIEG,
      dateEntreeUnite:r.entreeUnite,dateEntreeUO:r.entreeUO,
      agenceRUP:r.agence,metierRUP:r.metier,emploiRUP:r.emploi,m3eRUP:r.m3e,
      sourceRUP:r.source};
  });
}
export async function importerFichiersRUP(files,XLSX,previousRecords=[]){
  let incoming=[];
  for(const f of files){
    const bytes=await f.arrayBuffer();
    incoming.push(...readRupWorkbook(bytes,f.name,XLSX));
  }
  const sources=new Set(incoming.map(r=>r.source));
  // Remplacement idempotent des versions d'une même source, sans doubler les agents.
  return consolidateRup([...previousRecords.filter(r=>!sources.has(r.source)),...incoming]);
}
