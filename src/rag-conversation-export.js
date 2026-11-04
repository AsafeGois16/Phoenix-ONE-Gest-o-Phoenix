import {labGuardFeedback} from './lab-guard-feedback.js'

// Exportação local das mensagens visíveis no Laboratório RAG.
// Não recupera fontes, dados operacionais nem credenciais.
export function ragConversationTxt({agent,messages,generatedAt=new Date()}){
 const agentName=agent==='clara'?'Clara':agent==='murilo'?'Murilo':'Agente'
 const when=generatedAt instanceof Date&&!Number.isNaN(generatedAt.valueOf())?generatedAt.toISOString():'data não informada'
 const lines=[
  'PHOENIX ONE | LABORATÓRIO RAG',
  'TRANSCRIÇÃO PARA HOMOLOGAÇÃO',
  'Gerado em: '+when,
  'Agente: '+agentName,
  'Ambiente: simulação RAG, sem integração com Junior/WhatsApp.',
  'Atenção: contém o texto exibido na conversa. Use dados fictícios e revise antes de compartilhar.',
  '',
  '============================================================'
 ]
 const list=Array.isArray(messages)?messages:[]
 let index=0
 for(const m of list){
  if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string')continue
  index++
  const who=m.role==='user'?'Você':agentName
  const version=m.role==='assistant'&&m.promptVersion!=null?' | prompt v'+String(m.promptVersion):''
  lines.push('',String(index).padStart(2,'0')+' | '+who+version,m.content.trim())
  if(m.role==='assistant'&&m.labGuardApplied===true)lines.push('[ATENÇÃO] '+labGuardFeedback(m.labGuardReasons))
 }
 lines.push('','============================================================','Fim da conversa. Sem dados de sessão, fontes RAG ou credenciais.','')
 return lines.join('\n')
}
