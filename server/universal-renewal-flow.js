/**
 * Renovação universal — pré-consulta opcional com a Clara, antes da passagem
 * ao Murilo. A Bridge/Júnior é a única autoridade de autenticação e vínculo.
 * Nenhum CPF, prova, apólice, veículo, número ou verification_ref é armazenado
 * ou incluído nos textos de resposta/handoff.
 *
 * Todo o mecanismo exige opt-in server-side e V4 verificado. Se um produto
 * não tem código V4 autorizado, continua a cotação normal (sem falso "não").
 */
import {detectSdrQuoteProduct} from './murilo-sdr-flow.js'
import {clientDeclaredName} from './commercial-intake.js'
import {validProductCode} from './v4-verified-context.js'

const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/g,' ').trim()
const incoming=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const outgoing=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const yes=s=>/^(?:sim|s|pode sim|sim pode|claro|quero sim|autorizo|confirmo|pode ser|ok|tudo bem)[.! ]*$/.test(fold(s))
const no=s=>/^(?:nao|nao obrigado|nao obrigada|prefiro nao|agora nao|nao quero|sem documento|prefiro nao informar)[.! ]*$/.test(fold(s))
const maps=Object.freeze({saude_empresarial:'saude',odonto_empresarial:'odonto'})
const names=Object.freeze({
 auto:'Auto',frota:'Frota',residencial:'Residencial',fianca:'Fiança',
 viagem:'Viagem',bike:'Bicicleta',empresarial:'Empresarial',vida:'Vida',
 vida_grupo:'Vida em Grupo',saude:'Saúde',odonto:'Odontológico',
 pet:'Pet',previdencia:'Previdência',rc:'Responsabilidade Civil',
 garantia:'Garantia'
})
const renewalRe=/\b(?:renovar|renovacao|renovando|renove|renova)\b/
const unsafeRe=/\b(?:cancelar|cancelamento|abrir sinistro|acionar sinistro|segunda via|excluir beneficiario|incluir dependente)\b/
export function universalRenewalContext(messages){
 const list=(Array.isArray(messages)?messages:[]).filter(incoming).slice(-24)
 if(!list.length)return null
 const reset=list.findLastIndex(m=>/\b(?:outro assunto|quero falar de outro assunto|nova solicitacao)\b/.test(fold(m.text)))
 const scoped=list.slice(reset+1)
 // Uma cotação NOVA posterior substitui a renovação anterior. Não reutilizar
 // a palavra "renovação" de um assunto já encerrado em outro produto.
 const requests=scoped.map(m=>fold(m.text)).filter(x=>/\b(?:renovar|renovacao|renovando|renove|renova|cotar|cotacao|orcamento|contratar|contratacao|seguro novo)\b/.test(x))
 const current=requests.at(-1)||''
 if(!renewalRe.test(current)||unsafeRe.test(current))return null
 const declared=detectSdrQuoteProduct(scoped)
 if(!declared)return null // tema ainda indefinido/ambíguo: fluxo de esclarecimento
 const product=maps[declared]||declared
 return {product,label:names[product]||null,queryable:validProductCode(product)&&Boolean(names[product])}
}
export function isUniversalRenewalOffer(text){
 return /\bposso confirmar sua identidade e consultar se ha um seguro da categoria\b/.test(fold(text))
}
export function isUniversalRenewalMuriloOffer(text){
 return /\bposso encaminhar sua renovacao ao murilo\b/.test(fold(text))
}
const appeared=m=>/\b(?:sou (?:a )?clara|clara, (?:assistente|concierge)|aqui e clara)\b/.test(fold(m.text))
const muriloAppeared=m=>/\b(?:sou (?:o )?murilo|murilo, do time comercial)\b/.test(fold(m.text))
const deniedDocument=(text,question)=>/\b(?:cpf|cnpj|documento)\b/.test(fold(question))&&no(text)
export function universalRenewalClaraStage(messages){
 const list=Array.isArray(messages)?messages:[]
 if(!incoming(list.at(-1)))return null
 const info=universalRenewalContext(list)
 if(!info?.queryable)return null
 if(!clientDeclaredName(list))return null // manter acolhimento e pergunta de nome
 if(list.some(m=>outgoing(m)&&muriloAppeared(m)))return null
 if(!list.some(m=>outgoing(m)&&appeared(m)))return null
 const earlier=list.slice(0,-1).reverse().find(outgoing)
 const last=fold(list.at(-1).text)
 const offerAt=list.findLastIndex(m=>outgoing(m)&&isUniversalRenewalOffer(m.text))
 const switchAt=list.findLastIndex(m=>outgoing(m)&&/\b(?:posso|deseja|quer)\b.{0,140}\b(?:encaminhar|passar|transferir)\b.{0,120}\bmurilo\b/.test(fold(m.text)))
 if(switchAt>offerAt)return null // Cliente já recebeu convite para Murilo.
 if(offerAt<0){
  if(/\b(?:emergencia|urgencia|guincho agora|sinistro|preciso de atendimento humano)\b/.test(last))return null
  return {stage:'offer',product:info.product,label:info.label,
   reply:'Para facilitar sua renovação de Seguro '+info.label+
    ' e evitar perguntas repetidas, posso confirmar sua identidade e consultar se há um seguro da categoria cadastrado na Phoenix?'}
 }
 const firstAnswer=list.slice(offerAt+1).find(incoming)
 if(!firstAnswer)return null
 if(no(firstAnswer.text))return {stage:'continue',product:info.product,label:info.label}
 if(!yes(firstAnswer.text)){
  if(no(last))return {stage:'continue',product:info.product,label:info.label}
  return {stage:'clarify',product:info.product,label:info.label,
   reply:'Prefere confirmar sua identidade para consultar o cadastro ou continuar direto com a cotação? Pode responder sim ou não.'}
 }
 if(earlier&&deniedDocument(last,earlier.text))return {stage:'continue',product:info.product,label:info.label}
 return {stage:'verify',product:info.product,label:info.label}
}
export function universalRenewalSwitchMessage(info,found){
 const prefix=found===true?'Confirmei que existe Seguro '+info.label+' no cadastro autorizado. ':
  found===false?'Não localizei Seguro '+info.label+' nesta consulta. Podemos continuar com a cotação normalmente. ':
  'Não consegui confirmar o cadastro com segurança neste momento. Podemos continuar com a cotação normalmente. '
 return prefix+'Posso encaminhar sua renovação ao Murilo, nosso assistente comercial, para continuar o atendimento?'
}
/**
 * O contrato atualizado do Junior distingue resultado de cobertura
 * explicitamente: nunca inferir "not_found" de policies=[].
 * Com Auto/Moto/Frota, a contagem representa o grupo consultado.
 */
const autoGroup=new Set(['auto','moto','frota'])
export function verifiedRenewalSummary(verification,product){
 const check=verification?.coverage_check
 if(verification?.status!=='verified'||!Array.isArray(verification.field_scopes)||
    !verification.field_scopes.includes('policies.read')||
    !check||check.product_code!==product||
    !['found','not_found'].includes(check.result)||
    !Number.isInteger(check.count)||check.count<0||check.count>100000||
    (check.result==='found')!==(check.count>0))return null
 // Resultado do Junior é a autoridade; a lista pode vir parcial ou truncada.
 const found=check.result==='found'
 const policies=Array.isArray(verification.policies)?verification.policies.filter(p=>
   p&&typeof p==='object'&&(
     autoGroup.has(product)?autoGroup.has(p.product_code):p.product_code===product
   )):[]
 const single=found&&check.count===1&&policies.length===1?policies[0]:null
 return {found,product,identityType:verification.verified_profile?.tipo_pessoa||null,
  insurer:typeof single?.seguradora==='string'&&single.seguradora.trim()?single.seguradora.trim():null,
  expiry:typeof single?.fim_vigencia==='string'&&/^(?:\d{4}-\d{2}-\d{2}|\d{2}[/]\d{2}[/]\d{4})$/.test(single.fim_vigencia.trim())?single.fim_vigencia.trim():null,
  count:check.count}
}

/**
 * Só marcar como renovação um encaminhamento humano realmente autorizado
 * e vinculado a um pedido atual de renovação, preservando outras operações.
 * O Junior usa intent=renovacao para NÃO criar lead no funil de vendas.
 */
export function tagRenewalHandoff(payload,messages){
 if(payload?.humanHandoff!==true||!payload.handoff||
    !['murilo','clara'].includes(payload.agent)||
    !['patrimonio','beneficios'].includes(payload.handoff.department))return payload
 const info=universalRenewalContext(messages)
 if(!info)return payload
 const last=String((Array.isArray(messages)?messages:[]).at(-1)?.text||'')
 if(/\b(?:sinistro|emergencia|urgencia|cancelamento|exclusao|inclusao|segunda via)\b/i.test(fold(last)))return payload
 if(payload.handoff.intent&& !['nova_cotacao','renovacao'].includes(payload.handoff.intent))return payload
 return {...payload,handoff:{...payload.handoff,intent:'renovacao',product:info.product}}
}
