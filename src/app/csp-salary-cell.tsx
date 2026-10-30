import type {CspEvent} from '../lib/csp';
import type {AgentRecord} from '../lib/agents';

type Salary=Partial<AgentRecord>|undefined;
const hasSalary=(r:Salary)=>r?.gf!==undefined||r?.nr!==undefined;
const value=(r:Salary)=>r?`GF ${r.gf??'?'} · NR ${r.nr??'?'}`:'Non renseigné';

// Documentary facts remain visible even when identity or another prerequisite
// prevents calculation. They must never be presented as an applied movement.
export function CspSalaryCell({event:e,before,after}:{event:CspEvent;before?:Salary;after?:Salary}){
 const readBefore={gf:e.gfBefore,nr:e.nrBefore},readAfter={gf:e.gfAfter,nr:e.nrAfter};
 const hasBefore=hasSalary(readBefore),hasAfter=hasSalary(readAfter),documented=hasBefore||hasAfter;
 const same=hasBefore&&hasAfter&&readBefore.gf===readAfter.gf&&readBefore.nr===readAfter.nr;
 const printed=hasAfter&&!hasBefore||same?value(readAfter):hasBefore&&!hasAfter?value(readBefore):`${value(readBefore)} → ${value(readAfter)}`;
 const calculated=hasSalary(before)||hasSalary(after);
 return <>
  {calculated?<>{value(before)}<small>→ {value(after)}</small></>:!documented?'Non renseigné':null}
  {documented&&<small><b>Lus dans le document : {printed}</b></small>}
  {!calculated&&documented&&<small>Situation non encore calculée ; valeurs du document conservées.</small>}
  {after?.nrProvisional&&<small>NR non précisé dans le RD : dernière valeur connue</small>}
 </>;
}
