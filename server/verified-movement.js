/**
 * Movimentações: somente listar apólices retornadas por identity/resolve
 * após a confirmação de identidade feita pela gestão do Junior.
 * Não há CRM LEADS, persistência de dados pessoais ou acesso direto ao WhatsApp.
 */
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const safe=value=>String(value||'').replace(/[\r\n\t\u0000-\u001f]/g,' ').trim().slice(0,90)
const movementNames={inclusao:'inclusão',exclusao:'exclusão',alteracao:'alteração cadastral'}
export const movementDocumentPrompt='Para localizar seu cadastro e verificar com segurança qual plano será movimentado, pode me informar o CPF ou CNPJ do titular do seguro? O documento será usado somente na consulta protegida ao sistema de gestão. Não preciso dos documentos do dependente nesta etapa.'
function categoryFor(intake){
 const product=intake?.product
 if(product==='Saúde')return 'Saúde'
 if(product==='Odonto')return 'Odonto'
 if(product==='Vida')return 'Vida'
 return null
}
function matchesCategory(policy,category){
 const value=fold([policy?.ramo,policy?.linha].filter(Boolean).join(' '))
 if(category==='Saúde')return /\b(?:saude|medic[ao]|hospitalar|health)\b/.test(value)&&!/\b(?:odonto|dental)\b/.test(value)
 if(category==='Odonto')return /\b(?:odonto|odontolog|dental)\w*/.test(value)
 if(category==='Vida')return /\bvida\b/.test(value)&&!/\b(?:previdencia|saude)\b/.test(value)
 return false
}
export function categoryPolicies(policies,category){
 return (Array.isArray(policies)?policies:[]).filter(p=>p&&matchesCategory(p,category)).slice(0,12)
}
export function policyLabel(policy,category){
 const insurer=safe(policy?.seguradora)
 const line=safe(policy?.linha)
 const number=safe(policy?.numero)
 const relevantLine=line&&!/^(?:saude|odonto|vida|plano de saude|assistencia medica)$/i.test(fold(line))?line:null
 const identifiers=[insurer||null,relevantLine,number?'apólice final '+number.slice(-4):null].filter(Boolean)
 return category+' — '+(identifiers.length?identifiers.join(' · '):'plano cadastrado')
}
function lastAgentText(messages){
 return [...(Array.isArray(messages)?messages:[])].reverse()
  .find(m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string')?.text||''
}
function selectedIndex(answer,choices,previous){
 const text=fold(answer)
 const prompt=fold(previous)
 // Uma escolha só pode confirmar a pergunta anterior sobre os planos.
 if(!/qual destes planos de|confirma que este e o plano de/.test(prompt))return -1
 if(choices.length===1){
  if(/^(?:sim|isso|correto|confirmo|pode ser|exatamente|esse|este|1|opcao 1)[.! ]*$/.test(text))return 0
  return -1
 }
 const indexed=text.match(/^(?:(?:opcao|numero|plano|apolice)\s*)?(1[0-2]|[1-9])(?:\s*[.)!])?$/)
 if(indexed){const n=Number(indexed[1]);return n<=choices.length?n-1:-1}
 const ordinals=['primeiro','segundo','terceiro','quarto','quinto','sexto','setimo','oitavo','nono','decimo','decimo primeiro','decimo segundo']
 const found=ordinals.findIndex(v=>text===v||text==='o '+v||text==='a '+v)
 return found>=0&&found<choices.length?found:-1
}
const base=(reply,humanHandoff=false,handoff=null)=>({agent:'clara',reply,humanHandoff,handoff})
const routeName=type=>movementNames[type]||'movimentação'
export function verifiedMovementDecision(intake,policies,messages){
 const type=intake?.type
 const category=categoryFor(intake)
 const relation=intake?.relation
 const last=String(messages?.at(-1)?.text||'')
 if(!category){
  return base('Identidade confirmada. Para continuar sua movimentação, ela é referente ao seguro Saúde, Odonto ou Vida? Vou consultar somente os planos da categoria que você indicar.')
 }
 const choices=categoryPolicies(policies,category)
 if(!relation)return base('Identidade confirmada. Para seguir com a '+routeName(type)+', a movimentação envolve titular ou dependente?')
 if(!choices.length){
  return base('Concluí a etapa de verificação, mas não consegui identificar um plano de '+category+' para seleção nesta consulta. Vou direcionar sua solicitação ao Backoffice para conferência, sem realizar nenhuma movimentação.',true,{
   department:'backoffice',
   reason:'Conferir plano de '+category+' não identificado na consulta',
   summary:'Cliente solicita '+routeName(type)+' no seguro '+category+'. Identidade verificada via gestão do Junior; nenhuma apólice da categoria foi identificada na consulta autorizada. Backoffice deve localizar o contrato e concluir a triagem antes de qualquer ação.'
  })
 }
 const previous=lastAgentText(messages)
 const chosen=selectedIndex(last,choices,previous)
 if(chosen>=0){
  const selected=choices[chosen]
  const ref=policyLabel(selected,category)
  const summary='Cliente solicita '+routeName(type)+' de '+relation+' no seguro '+category+'. Plano selecionado após validação do titular pela gestão: '+ref+'. Backoffice deve confirmar vínculo, documentos, elegibilidade e se há movimentação correspondente em outro produto. Nenhuma movimentação foi executada.'
  return base('Obrigada! Confirmei que você deseja solicitar a '+routeName(type)+' de '+relation+' no plano '+ref+'. Vou encaminhar esse resumo ao Backoffice para análise e execução. A movimentação ainda não foi realizada.',true,{
   department:'backoffice',reason:'Movimentação de '+relation+' em '+category,summary
  })
 }
 if(choices.length===1){
  return base('Identidade confirmada. Localizei este plano de '+category+':\n1. '+policyLabel(choices[0],category)+'\n\nConfirma que este é o plano de '+category+' em que deseja solicitar a '+routeName(type)+'?')
 }
 const options=choices.map((p,i)=>(i+1)+'. '+policyLabel(p,category)).join('\n')
 return base('Identidade confirmada. Encontrei estes planos de '+category+' vinculados ao cadastro verificado:\n'+options+'\n\nQual destes planos de '+category+' você deseja movimentar? Responda com o número da opção.')
}
