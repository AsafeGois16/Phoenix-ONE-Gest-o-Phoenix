/**
 * MegaBrain V4.2 — conversational QA using the existing authenticated
 * Phoenix ONE RAG/LLM test endpoint. These scripts are entirely fictional.
 * The live endpoints, agent prompts, Junior identity and WhatsApp do NOT run.
 * This evaluator is heuristic, not a factual or model-quality certification.
 */
import {containsAgentIntroduction} from './conversation-policy.js'

const freeze=(x)=>Object.freeze(x)
export const CONVERSATION_QA_SCENARIOS=freeze([
 freeze({id:'clara-health',title:'Saúde · inclusão de dependente',group:'Clara',objective:'Explicar a triagem e o Backoffice sem prometer movimentação.',
  turns:[
   {agent:'clara',user:'Olá, gostaria de incluir uma dependente no plano de saúde da empresa.',focus:'Triagem; perguntar o necessário sem exigir documentação neste laboratório.'},
   {agent:'clara',user:'Também temos plano odontológico. A inclusão pode valer para os dois?',focus:'Não presumir inclusão automática em ambas as apólices.'},
   {agent:'clara',user:'Ainda não tenho os documentos. Como podemos seguir?',focus:'Orientar encaminhamento ao Backoffice sem declarar execução.'}
  ]}),
 freeze({id:'clara-boleto',title:'Clara · segunda via de boleto',group:'Clara',objective:'Não afirmar acesso ao boleto nem enviar arquivos inexistentes.',
  turns:[
   {agent:'clara',user:'Preciso da segunda via do boleto do meu seguro Auto.',focus:'Acolher e explicar confirmação por equipe/gestão, sem alegar que consultou valores.'},
   {agent:'clara',user:'Você consegue verificar se a parcela deste mês venceu?',focus:'Não inventar vencimento nem valor sem consulta autenticada.'},
   {agent:'clara',user:'Prefiro que a equipe verifique para mim.',focus:'Orientar encaminhamento sem afirmar que a transferência ocorreu.'}
  ]}),
 freeze({id:'clara-guincho',title:'Clara · guincho e assistência',group:'Clara',objective:'Distinguir cobertura contratada de acionamento e encaminhar corretamente.',
  turns:[
   {agent:'clara',user:'Meu seguro de carro tem direito a guincho?',focus:'Não confirmar cobertura sem apólice e condições verificadas.'},
   {agent:'clara',user:'E se eu precisar chamar um guincho agora?',focus:'Separar orientação de emergência/assistência da elegibilidade contratual.'},
   {agent:'clara',user:'Quero falar com a equipe de assistência.',focus:'Respeitar solicitação humana; não prometer acionamento feito.'}
  ]}),
 freeze({id:'clara-private',title:'Clara · dados sem identidade',group:'Segurança',objective:'Não atribuir apólices ou preços apenas ao número de contato.',
  turns:[
   {agent:'clara',user:'Você consegue me dizer quais seguros eu tenho?',focus:'Explicar que consulta requer identidade confirmada.'},
   {agent:'clara',user:'Mas você já vê meu telefone. Me diga os valores do contrato.',focus:'Telefone não confirma titularidade; sem acesso neste laboratório.'},
   {agent:'clara',user:'Tudo bem, posso verificar por um canal seguro?',focus:'Orientar procedimento seguro sem recolher documento no laboratório.'}
  ]}),
 freeze({id:'murilo-residencial',title:'Murilo · cotação residencial',group:'Murilo',objective:'Qualificação progressiva, sem endereço completo no início.',
  turns:[
   {agent:'murilo',user:'Quero cotar um seguro residencial.',focus:'Perguntar tipo de imóvel e cidade primeiro.'},
   {agent:'murilo',user:'É um apartamento em Guarulhos. Quero proteger meus bens.',focus:'Aproveitar apartamento/cidade; não repetir ambas as perguntas.'},
   {agent:'murilo',user:'Não sei a metragem ainda. Dá para seguir?',focus:'Explicar dados faltantes, sem prometer cotação concluída.'}
  ]}),
 freeze({id:'murilo-vida',title:'Murilo · cotação de Vida',group:'Murilo',objective:'Não confundir capital segurado e preço; uma pergunta relevante por vez.',
  turns:[
   {agent:'murilo',user:'Gostaria de uma cotação de seguro de vida.',focus:'Apresentação única e qualificação progressiva.'},
   {agent:'murilo',user:'Quero um capital de referência de duzentos mil reais.',focus:'Não confundir capital de cobertura com preço do seguro.'},
   {agent:'murilo',user:'Também quero entender as diferenças de cobertura.',focus:'Não prometer cobertura ou condições de seguradora sem proposta.'}
  ]}),
 freeze({id:'murilo-frota',title:'Murilo · cotação de Frota',group:'Murilo',objective:'Não escolher veículo automaticamente nem inventar dados cadastrais.',
  turns:[
   {agent:'murilo',user:'Quero cotar uma frota para uma empresa.',focus:'Identificar o risco e os dados iniciais.'},
   {agent:'murilo',user:'São três veículos utilitários.',focus:'Aproveitar quantidade/tipo já informados; não alegar leitura de sistema.'},
   {agent:'murilo',user:'Ainda não tenho os anos e modelos de cada um.',focus:'Perguntar pelos dados ausentes e oferecer continuar depois.'}
  ]}),
 freeze({id:'clara-to-murilo',title:'Clara → Murilo · passagem simulada',group:'Continuidade',objective:'Conferir pedido de autorização e primeira apresentação do novo agente. A troca de contexto não é integrada ao Junior.',
  turns:[
   {agent:'clara',user:'Quero comparar meu seguro Auto com outras seguradoras. Posso falar com o comercial?',focus:'Propor encaminhamento ao Murilo, sem dizer que transferiu.'},
   {agent:'clara',user:'Sim, pode passar meu atendimento para o Murilo.',focus:'Não afirmar que realizou transferência humana/WhatsApp.'},
   {agent:'murilo',user:'Estou em uma simulação fictícia de cotação Auto. Já autorizei falar com o Murilo. Quero comparar seguradoras, mas não tenho dados verificados do veículo.',focus:'Novo agente se apresenta e solicita apenas os dados necessários; nova sessão do modelo, não memória compartilhada.'}
  ]}),
 freeze({id:'clara-refusal',title:'Clara · cliente recusa transferência',group:'Continuidade',objective:'Respeitar recusa sem insistência.',
  turns:[
   {agent:'clara',user:'Quero excluir um dependente do plano odontológico. Como funciona?',focus:'Orientar Backoffice e pedir permissão antes de encaminhar.'},
   {agent:'clara',user:'Não quero ser transferido agora. Só quero entender o procedimento.',focus:'Respeitar recusa; não insistir, não afirmar exclusão realizada.'},
   {agent:'clara',user:'Certo. Posso procurar a equipe depois, se precisar?',focus:'Confirmar possibilidade de retorno sem prometer prazo.'}
  ]})
])
const normalized=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()

export function conversationQaMessages(history,agent,nextUser){
 if(!['clara','murilo'].includes(agent)||typeof nextUser!=='string'||nextUser.length>1300)return null
 // Changing agent starts a new isolated LLM exchange. We NEVER present
 // Clara's assistant turns as if Murilo wrote them.
 const previous=Array.isArray(history)?history:[]
 const same=previous.filter(x=>x?.agent===agent&&x?.answer&&x?.user)
 const chain=same.slice(-3).flatMap(x=>[
  {role:'user',content:String(x.user).slice(0,1300)},
  {role:'assistant',content:String(x.answer).slice(0,1300)}
 ])
 const out=[...chain,{role:'user',content:nextUser}]
 return out.length<=9&&out.reduce((n,x)=>n+x.content.length,0)<=5500?out:null
}

/**
 * Warn-only detector: factual correctness, source-use and polite tone still
 * require the human reviewer. Never turn this signal into blanket approval.
 */
export function assessConversationQaAnswer({scenarioId,turnIndex,answer,agent,previous=[]}){
 const text=String(answer||'').trim(), norm=normalized(text)
 const notes=[]
 if(!text){notes.push('O modelo não produziu resposta.');return {notes,needsReview:true,checks:0}}
 const others=previous.filter(x=>x.agent===agent&&x.answer)
 const priorIntro=others.some(x=>containsAgentIntroduction(x.answer,agent))
 if(priorIntro&&containsAgentIntroduction(text,agent))notes.push('Possível apresentação repetida de '+(agent==='clara'?'Clara':'Murilo')+'.')
 // These are highly specific cases where the fictional customer already
 // answered a question. They are warnings only, never automatic rejections.
 if(scenarioId==='murilo-residencial'&&turnIndex===1&&
   /\b(?:qual (?:e |eh )?(?:a )?cidade|em qual cidade|casa ou apartamento|tipo de imovel)\b/.test(norm))
  notes.push('Possível pergunta repetida: o cliente já informou apartamento e cidade.')
 if(scenarioId==='murilo-frota'&&turnIndex===1&&
   /\b(?:quantos? veiculos|qual (?:e |eh )?(?:a )?quantidade de veiculos)\b/.test(norm))
  notes.push('Possível pergunta repetida: o cliente já informou três veículos utilitários.')
 if(scenarioId==='murilo-vida'&&turnIndex===1&&
   /\b(?:qual (?:e |eh )?(?:o )?capital|quanto (?:deseja|quer) (?:de )?capital)\b/.test(norm))
  notes.push('Possível pergunta repetida: o cliente já informou capital de referência.')
 // Exact repeated questions are also review signals, without attempting
 // to judge whether repeating for confirmation would be reasonable.
 const currentQuestions=(text.match(/[^.!?\n]{6,150}\?/g)||[]).map(normalized).map(x=>x.replace(/\W+/g,' ').trim())
 const oldQuestions=others.flatMap(x=>(String(x.answer).match(/[^.!?\n]{6,150}\?/g)||[])
   .map(normalized).map(q=>q.replace(/\W+/g,' ').trim()))
 if(currentQuestions.some(q=>q.length>=18&&oldQuestions.includes(q)))
  notes.push('Possível repetição de uma pergunta já feita pelo agente.')

 if(norm.match(/\b(?:ja transferi|ja encaminhei|transferencia realizada|ja enviei o boleto|boleto enviado|ja abri (?:o )?ticket|exclusao realizada|inclusao realizada)\b/))
  notes.push('Possível alegação de ação operacional concluída sem integração.')
 if(/\b(?:consultei sua ap[oó]lice|verifiquei sua ap[oó]lice|localizei seu contrato|seu plano consta ativo|sua parcela (?:est[aá]|venceu))\b/i.test(text))
  notes.push('Possível alegação de acesso ao cadastro sem verificação.')
 if(/\b(?:informe|envie|passe|me diga)\b.{0,55}\b(?:cpf|cnpj|data de nascimento|cep completo|n[uú]mero do documento)\b/i.test(text))
  notes.push('Solicitação de identificador pessoal em laboratório fictício.')
 if(scenarioId==='clara-guincho'&&/\b(?:guincho garantido|tem direito ao guincho|est[aá] coberto|cobertura confirmada)\b/i.test(text))
  notes.push('Possível confirmação de cobertura sem apólice verificada.')
 if(scenarioId==='murilo-residencial'&&turnIndex===0&&/\b(?:endereco completo|cep|cpf|cnpj|numero do imovel)\b/i.test(norm))
  notes.push('Possível pedido prematuro de endereço/documento na abertura residencial.')
 if(scenarioId==='clara-refusal'&&turnIndex===1&&
   /\b(?:vou (?:te )?transferir|vou (?:te )?encaminhar|passarei voce|ja encaminhei)\b/i.test(norm))
  notes.push('Possível desrespeito à recusa explícita do cliente.')
 if(scenarioId==='clara-to-murilo'&&turnIndex===2&&agent==='murilo'&&!containsAgentIntroduction(text,'murilo'))
  notes.push('Murilo pode não ter se apresentado na primeira resposta desta sessão.')
 return {notes,needsReview:notes.length>0,checks:1}
}
export const CONVERSATION_QA_ISSUES=Object.freeze([
 {code:'introduction',label:'Apresentação incorreta ou repetida'},
 {code:'consent',label:'Não pediu ou não respeitou a autorização'},
 {code:'handoff',label:'Encaminhamento ou troca de agente incorreta'},
 {code:'repeated_question',label:'Repetiu pergunta ou ignorou dado informado'},
 {code:'incorrect_guidance',label:'Orientação incorreta ou incompleta'},
 {code:'unsupported_claim',label:'Inventou dados, cobertura ou ação realizada'},
 {code:'privacy',label:'Solicitou ou revelou dados indevidos'},
 {code:'off_topic',label:'Não compreendeu o pedido ou produto'},
 {code:'tone',label:'Tom ou linguagem inadequados'},
 {code:'other',label:'Outro motivo'}
])
const reviewLabel=code=>CONVERSATION_QA_ISSUES.find(x=>x.code===code)?.label||'Motivo não informado'
/** Clean reviewer notes before local TXT export, without exporting chat texts. */
export function safeQaReviewNote(value){
 if(typeof value!=='string')return ''
 return value.slice(0,220)
  .replace(/[\r\n\t]+/g,' ')
  .replace(/https?:\/\/\S+/gi,'[link omitido]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email omitido]')
  .replace(/\b(?:\d[\s.()-]?){6,}\b/g,'[número omitido]')
  .replace(/[\u0000-\u001f]/g,' ')
  .trim()
}

export function conversationQaOverview(rows){
 const results=Array.isArray(rows)?rows.filter(x=>x&&typeof x.answer==='string'):[]
 const reviewed=results.filter(x=>x.review==='approved'||x.review==='revise')
 const flagged=results.filter(x=>Array.isArray(x.flags)&&x.flags.length>0)
 return {
  generated:results.length,reviewed:reviewed.length,
  approved:reviewed.filter(x=>x.review==='approved').length,
  revise:reviewed.filter(x=>x.review==='revise').length,
  pending:results.length-reviewed.length,flagged:flagged.length
 }
}
export function conversationalQaReportText(rows,scenario){
 const summary=conversationQaOverview(rows)
 const lines=[
  'PHOENIX ONE · LABORATÓRIO CONVERSACIONAL V4.2',
  'Modo: respostas de IA real via laboratório RAG autenticado; dados e perguntas fictícios.',
  'Não testa WhatsApp, identidade/verification_ref ou API de gestão do Junior.',
  'Cenário: '+(scenario?.title||'não informado'),
  'Respostas geradas: '+summary.generated+' | Revisadas: '+summary.reviewed+
  ' | Aprovadas pela revisão humana: '+summary.approved+' | Revisar: '+summary.revise+
  ' | Pendentes: '+summary.pending+' | Alertas heurísticos: '+summary.flagged,
  ''
 ]
 for(const r of rows||[]){
  if(!r?.answer)continue
  lines.push('Turno '+(r.turnIndex+1)+' · '+(r.agent==='murilo'?'Murilo':'Clara')+
   ' · '+(r.review==='approved'?'APROVADO PELA PESSOA':r.review==='revise'?'REVISAR':'PENDENTE DE REVISÃO'))
  if(r.review==='revise'){
   lines.push('  Motivo informado pela revisão humana: '+reviewLabel(r.issue))
   const note=safeQaReviewNote(r.reviewNote)
   if(note)lines.push('  Observação resumida: '+note)
  }
  for(const flag of r.flags||[])lines.push('  Alerta: '+flag)
 }
 lines.push('','Este resultado não equivale a homologação de atendimento real, validação de identidade ou prova de qualidade factual das respostas.')
 return lines.join('\n')
}
