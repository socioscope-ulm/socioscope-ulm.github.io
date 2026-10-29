import {cspKinds} from './csp.ts';
export function cspUnreadPages(reports:any[]=[]){return reports.filter(r=>r.status==='unsupported');}
export function cspPageWarning(r:any){
 const label=cspKinds[r.section as keyof typeof cspKinds]||r.section||'Rubrique inconnue';
 return `Page ${r.page} · ${label} : ${Object.hasOwn(cspKinds,r.section)?'rubrique reconnue, lecture du tableau incomplète':'rubrique non reconnue'}. ${r.count?`${r.count} ligne(s) repérée(s) à compléter ; d’autres lignes peuvent manquer.`:'Aucune décision de cette page n’a été importée.'} ${r.note||''}`;
}
