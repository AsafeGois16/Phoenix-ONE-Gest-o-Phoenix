import React from 'react'
import {CheckCircle2, CircleDashed, LockKeyhole, ShieldCheck} from 'lucide-react'
import {ACTION_CAPABILITIES} from '../server/action-capabilities.js'

const labels={enabled:'Permitido sob condições',pending_junior:'Aguardando integração',forbidden:'Exclusivo do Junior'}
export default function ActionMatrix(){
 return <section className="one-int-panel one-action-matrix">
   <h3><ShieldCheck size={18}/> Matriz de autonomia — Clara e Murilo</h3>
   <p>O status abaixo é uma regra do Phoenix ONE, não a confirmação de que a API operacional do Junior está homologada. Operações de escrita permanecem bloqueadas até autorização e teste específicos.</p>
   <div className="one-action-scroll">
    <table><thead><tr><th>Capacidade</th><th>Agente</th><th>Autorização</th><th>Estado</th></tr></thead>
      <tbody>{ACTION_CAPABILITIES.map(c=><tr key={c.id}>
       <td>{c.name}</td><td>{c.agents.length?c.agents.map(a=>a==='clara'?'Clara':'Murilo').join(' e '):'Sistema do Junior'}</td>
       <td>{c.identity==='verified'?'Identidade verificada'+(c.scopes.length?' · '+c.scopes.join(', '):''):c.scopes.length?c.scopes.join(', '):'Não requer documento'}</td>
       <td><span className={'one-action-state '+c.state}>{c.state==='enabled'?<CheckCircle2 size={14}/>:c.state==='pending_junior'?<CircleDashed size={14}/>:<LockKeyhole size={14}/>} {labels[c.state]}</span></td>
      </tr>)}</tbody>
    </table>
   </div>
   <p className="one-int-hint">As ações dependentes de pessoas ou mudanças contratuais não são executadas pelo agente. O WhatsApp, os tickets, o envio de documentos e a aprovação operacional continuam sob o sistema de gestão.</p>
 </section>
}
