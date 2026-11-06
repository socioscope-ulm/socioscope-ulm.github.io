'use client';
import type {ReactNode} from 'react';
import {Folder,ChevronRight} from 'lucide-react';

export default function DocumentFolder({title,count,children}:{title:string;count:number;children:ReactNode}){
 return <details className="document-folder">
  <summary><ChevronRight size={16} className="folder-chevron"/><Folder size={20}/><strong>{title}</strong><span className="badge">{count} fichier{count===1?'':'s'}</span></summary>
  <div className="document-folder-content">{children}</div>
 </details>;
}
