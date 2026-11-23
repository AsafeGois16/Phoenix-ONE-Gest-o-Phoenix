import React from 'react'
import {CheckCircle2,LoaderCircle,AlertCircle} from 'lucide-react'

/**
 * Progress for human-initiated Knowledge Hub operations.
 * Percentage is displayed ONLY when a real item/byte count is known.
 * An indeterminate bar is used for network requests without progress events.
 */
export default function KnowledgeProgress({value,compact=false}){
 if(!value?.label)return null
 const measured=Number.isFinite(value.total)&&value.total>0&&Number.isFinite(value.done)
 const total=measured?value.total:undefined
 const done=measured?Math.max(0,Math.min(value.done,total)):undefined
 const percent=measured?Math.round(done*100/total):undefined
 const status=value.error?'error':value.active===false?'done':'active'
 return <div className={'ops-knowledge-progress'+(compact?' compact':'')+' '+status} role="status" aria-live="polite">
  <div className="ops-knowledge-progress-top">
   <span className="ops-knowledge-progress-title">
    {status==='done'?<CheckCircle2 size={16}/>:status==='error'?<AlertCircle size={16}/>:<LoaderCircle size={16} className="ops-knowledge-progress-spinner"/>}
    {value.label}
   </span>
   <span className="ops-knowledge-progress-count">{measured?done+' de '+total+' · '+percent+'%':status==='active'?'Em andamento':status==='done'?'Concluído':'Não concluído'}</span>
  </div>
  <div className="ops-knowledge-progress-track" role="progressbar"
   aria-label={value.label} aria-valuemin={measured?0:undefined} aria-valuemax={measured?total:undefined} aria-valuenow={measured?done:undefined}
   aria-valuetext={measured?done+' de '+total+' itens processados':status==='active'?'Processando, duração variável':status==='done'?'Concluído':'Não concluído'}>
   <span className={'ops-knowledge-progress-fill'+(measured?'':' indeterminate')} style={measured?{width:percent+'%'}:undefined}/>
  </div>
  {value.note&&<small className="ops-knowledge-progress-note">{value.note}</small>}
 </div>
}
