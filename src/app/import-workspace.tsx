'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {ChevronRight,FileText,FolderOpen} from 'lucide-react';

/** Mêmes codes visuels que l'espace CSP, sans modifier les parcours d'import. */
type ImportKind='social'|'agents'|'rup'|'grid'|'bonuses';
const labels:Record<ImportKind,{kicker:string;title:string;description:string}>={
 social:{kicker:'ESPACE BILANS SOCIAUX',title:'Gestion des bilans sociaux',description:'Importer, vérifier et retrouver les bilans sociaux de référence.'},
 agents:{kicker:'ESPACE SITUATIONS INDIVIDUELLES',title:'Gestion des fichiers individuels',description:'Importer les photographies individuelles, valider les données et consulter les archives.'},
 rup:{kicker:'ESPACE RUP',title:'Gestion du registre du personnel',description:'Importer les données de carrière, examiner leur qualité et consulter les RUP enregistrés.'},
 grid:{kicker:'ESPACE GRILLES DE SALAIRE IEG',title:'Gestion des grilles de salaire',description:'Importer et vérifier les grilles de rémunération, puis consulter les références enregistrées.'},
 bonuses:{kicker:'ESPACE PRIMES ANNUELLES PAR GF',title:'Gestion des primes annuelles',description:'Importer et vérifier les primes annuelles et consulter les références par GF.'}
};

export default function ImportWorkspace({kind,children}:{kind:ImportKind;children:ReactNode}){
 const {kicker,title,description}=labels[kind];
 return <section className="csp-workspace import-workspace" aria-label={title}>
  <div className="csp-workspace-head">
   <div className="csp-workspace-icon"><FileText size={19}/></div>
   <div><div className="csp-workspace-kicker">{kicker}</div><h2>{title}</h2><p>{description}</p></div>
  </div>
  <div className="csp-workspace-sections">{children}</div>
 </section>;
}

export function ImportSubsection({title,badge,children,defaultOpen=false,reveal=false,onOpen}:{
 title:string;badge?:string;children:ReactNode;defaultOpen?:boolean;reveal?:boolean;onOpen?:()=>void;
}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(reveal&&ref.current)ref.current.open=true;},[reveal]);
 return <details ref={ref} onToggle={e=>{if(e.currentTarget.open)onOpen?.();}} className="document-folder csp-subsection import-subsection" defaultOpen={defaultOpen||reveal}>
  <summary><ChevronRight size={16} className="folder-chevron"/><FolderOpen size={20}/><strong>{title}</strong>{badge&&<span className="badge">{badge}</span>}</summary>
  <div className="document-folder-content">{children}</div>
 </details>;
}
