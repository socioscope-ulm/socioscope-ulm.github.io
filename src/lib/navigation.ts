// Screen identifiers stay in history state, never in URLs or server logs.
export type Screens = Record<string,string>;
type Entry = {index:number;screens:Screens;guard?:boolean};
const key='socioscopeNavigation';
export class ScreenHistory {
  current:Entry={index:0,screens:{tab:'overview'}};
  listeners=new Set<()=>void>();
  started=false;
  private browser:Pick<Window,'history'|'addEventListener'>;
  constructor(browser:Pick<Window,'history'|'addEventListener'>){this.browser=browser;}
  start(){
    if(this.started)return;
    this.started=true;
    const saved=this.browser.history.state?.[key] as Entry|undefined;
    if(saved&&!saved.guard)this.current=saved;
    else {
      this.write('replaceState',{index:0,screens:{tab:'overview'},guard:true});
      this.current={index:1,screens:{tab:'overview'}};
      this.write('pushState',this.current);
    }
    this.browser.addEventListener('popstate',this.pop);
  }
  private write(method:'replaceState'|'pushState',entry:Entry){
    this.browser.history[method]({...this.browser.history.state,[key]:entry},'');
  }
  private emit(){this.listeners.forEach(fn=>fn());}
  private pop=()=>{
    const target=this.browser.history.state?.[key] as Entry|undefined;
    // Accueil is the boundary: Back must not leave the private application.
    if(!target||target.guard||(target.index<this.current.index&&this.current.screens.tab==='overview')){
      this.current={index:(target?.index??0)+1,screens:{tab:'overview'}};
      this.write('pushState',this.current);
    }else this.current=target;
    this.emit();
  };
  go(changes:Screens){
    this.start();
    const screens={...this.current.screens,...changes};
    if(Object.keys(screens).every(k=>screens[k]===this.current.screens[k]))return;
    this.current={index:this.current.index+1,screens};
    this.write('pushState',this.current);this.emit();
  }
  back(){if(this.current.screens.tab!=='overview')this.browser.history.back();}
}
