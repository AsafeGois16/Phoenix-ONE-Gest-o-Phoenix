/**
 * Phoenix ONE · Laboratório Universal V4.1
 *
 * All inputs, dialogues and policy records below are FICTIONAL fixtures.
 * Evaluations call the REAL deterministic conversation/consent/risk policies.
 * No network, persistence, local storage, OpenAI API or real Junior protocol.
 * This is not an end-to-end test of AI prompt quality or live integration.
 */
import {sanitizeV41Risk,summarizeV41VerifiedQuote,replyV41VerifiedQuote,detectV41QuoteProduct} from './v4-universal-risk.js'
import {parseVerifiedProfile,v4VerifiedSummary,validVerificationRef,verifiedGreeting} from './v4-verified-context.js'
import {decideMuriloSwitch,enforceHumanHandoffConsent,confirmedOfferHandoff} from './consent-routing.js'
import {dedupeClaraIntroductions,omitRepeatedAgentIntroduction} from './conversation-policy.js'

const fromClient=text=>({direction:'inbound',author:'contact',text})
const fromAgent=text=>({direction:'outbound',author:'agent',text})
const pol=(product_code,risk_summary)=>({product_code,risk_summary})
const only=(scopes,product,purpose='quote',risk)=>sanitizeV41Risk(pol(product,risk),scopes,purpose)
const check=(name,condition,detail='')=>({name,pass:Boolean(condition),detail})
const forward=new Date(Date.now()+20*60*1000).toISOString()
const earlier=new Date(Date.now()-1000).toISOString()
const ref='abcdef1234567890abcdef1234567890abcdef1234567890'
const verified=(overrides={})=>({
 status:'verified',verified_at:earlier,expires_at:forward,verification_ref:ref,
 field_scopes:['profile.basic','policies.read','risk.auto.read'],
 verified_profile:{nome_tratamento:'Marina',tipo_pessoa:'pf',relacao_com_contrato:'titular'},
 ...overrides
})
const handoff={agent:'clara',reply:'Vou encaminhar agora.',humanHandoff:true,handoff:{department:'patrimonio',reason:'Solicitação fictícia',summary:'Simulação QA'}}

export const UNIVERSAL_SCENARIOS=[
 {
  id:'auto-verified',title:'Auto · cotação sem repetir dados',group:'Contexto verificado',product:'Auto',agent:'Murilo',
  objective:'Reutilizar apenas o veículo autorizado, sem divulgar placa nem consultar outro produto.',
  dialogue:[
   ['Clara','Identidade do titular verificada pelo sistema fictício.'],
   ['Cliente','Quero cotar o mesmo carro em outra seguradora.'],
   ['Clara','Posso encaminhar ao Murilo para a cotação?'],
   ['Cliente','Sim.'],
   ['Murilo','Pelo cadastro autorizado, identifiquei o veículo. Confirma que é esse?']
  ],
  run:()=>{
   const data=only(['policies.read','risk.auto.read'],'auto','quote',{
    vehicle:{marca:'Marca Exemplo',modelo:'Modelo X',ano_modelo:2022,placa:'ABC1D23',chassi:'SIGILO'}
   })
   const response=replyV41VerifiedQuote(summarizeV41VerifiedQuote([pol('auto',data)],'auto'))
   return [
    check('Veículo verificado aproveitado',response.includes('Marca Exemplo Modelo X 2022')),
    check('Placa e chassi não chegam ao contexto',!JSON.stringify(data).includes('ABC1D23')&&!JSON.stringify(data).includes('SIGILO')),
    check('Não pede novamente marca/modelo/ano',!/qual (?:é|o) (?:a )?(?:marca|modelo|ano)/i.test(response)),
    check('Consulta exige escopo Auto',only(['policies.read'],'auto','quote',{vehicle:{marca:'Marca Exemplo'}})===null)
   ]
  }
 },
 {
  id:'frota-selection',title:'Frota · vários veículos',group:'Contexto verificado',product:'Frota',agent:'Murilo',
  objective:'Ler itens autorizados e solicitar a escolha do cliente, sem selecionar o primeiro.',
  dialogue:[
   ['Cliente','Preciso de uma cotação para nossa frota.'],
   ['Murilo','Vejo que existem dois veículos cadastrados.'],
   ['Murilo','Qual deles deseja utilizar na comparação?']
  ],
  run:()=>{
   const data=only(['risk.frota.read'],'frota','quote',{fleet:{
    quantidade:2,itens:[{item:1,item_ref:'item-1',marca_modelo:'Utilitário A',ano_modelo:2021,placa:'PLACA1'},
                       {item:2,item_ref:'item-2',marca_modelo:'Utilitário B',ano_modelo:2022}]
   }})
   const response=replyV41VerifiedQuote(summarizeV41VerifiedQuote([pol('frota',data)],'frota'))
   return [
    check('Itens do Junior interpretados',data?.fleet?.quantidade_itens_ativos===2&&data.fleet.items.length===2),
    check('Pergunta qual veículo o cliente quer',/qual dos veículos/i.test(response)),
    check('Não escolhe automaticamente',/não vou selecionar automaticamente/i.test(response)),
    check('Placa omitida',!JSON.stringify(data).includes('PLACA1'))
   ]
  }
 },
 {
  id:'residential-purpose',title:'Residencial · localização limitada',group:'Contexto verificado',product:'Residencial',agent:'Murilo',
  objective:'Usar ocupação e cidade apenas com as permissões e finalidade necessárias.',
  dialogue:[
   ['Cliente','Gostaria de cotar meu seguro residencial.'],
   ['Murilo','O imóvel consta com ocupação residencial. Confirma que é esse imóvel?']
  ],
  run:()=>{
   const raw={property:{tipo_ocupacao:'Residencial',cidade_uf:'Guarulhos/SP',cep_prefixo:'07020',endereco:'Rua Fictícia, 123'}}
   const withLocation=only(['risk.residencial.read','profile.location'],'residencial','quote',raw)
   const service=only(['risk.residencial.read','profile.location'],'residencial','service',raw)
   return [
    check('Ocupação aproveitada',withLocation.property.tipo_ocupacao==='Residencial'),
    check('Cidade/UF permitida na cotação',withLocation.property.cidade_uf==='Guarulhos/SP'),
    check('Cidade não liberada na consulta comum',service.property.cidade_uf===undefined),
    check('Endereço completo nunca liberado',!JSON.stringify(withLocation).includes('Rua Fictícia'))
   ]
  }
 },
 {
  id:'life-bands',title:'Vida · capital e faixa etária',group:'Contexto verificado',product:'Vida',agent:'Murilo',
  objective:'Usar faixa etária somente com consentimento específico, sem profissão ou data de nascimento.',
  dialogue:[
   ['Cliente','Quero comparar meu seguro de vida.'],
   ['Murilo','Há um capital segurado registrado. Podemos utilizá-lo como referência?']
  ],
  run:()=>{
   const raw={insured_person:{capital_segurado:200000,faixa_etaria:'39-43',profissao:'NÃO EXIBIR',data_nascimento:'1985-01-01'}}
   const authorized=only(['risk.vida.read','profile.age_band'],'vida','quote',raw)
   const unauthorized=only(['risk.vida.read'],'vida','quote',raw)
   const reply=replyV41VerifiedQuote(summarizeV41VerifiedQuote([pol('vida',authorized)],'vida'))
   return [
    check('Capital segurado preservado',authorized.insured_person.capital_segurado===200000),
    check('Faixa etária apenas com escopo',authorized.insured_person.faixa_etaria==='39-43'&&unauthorized.insured_person.faixa_etaria===undefined),
    check('Não mostra profissão nem nascimento',!/NÃO EXIBIR|1985/.test(JSON.stringify(authorized))),
    check('Não presume nova cobertura',/como referência/i.test(reply)&&!/cobertura garantida/i.test(reply))
   ]
  }
 },
 {
  id:'health-aggregate',title:'Saúde · vidas agregadas',group:'Contexto verificado',product:'Saúde',agent:'Clara',
  objective:'Preservar dados corporativos agregados, sem informações clínicas nem dependentes.',
  dialogue:[
   ['Cliente','Quero saber qual plano de saúde está cadastrado.'],
   ['Clara','Após a verificação, consultei somente os dados autorizados do plano.']
  ],
  run:()=>{
   const raw={benefits:{operadora:'Operadora Exemplo',modalidade:'Empresarial',vidas:23,plano:'Plano A',
    cid:'SIGILO',diagnostico:'SIGILO',dependentes:[{nome:'NÃO EXIBIR'}]}}
   const allowed=only(['risk.saude.read'],'saude','service',raw)
   const denied=only(['policies.read'],'saude','service',raw)
   return [
    check('Operadora e modalidade disponíveis',allowed.benefits.operadora==='Operadora Exemplo'&&allowed.benefits.modalidade==='Empresarial'),
    check('Quantidade agregada correta',allowed.benefits.quantidade_vidas===23),
    check('Sem dados clínicos nem dependentes',!/SIGILO|NÃO EXIBIR|cid|diagnostico/i.test(JSON.stringify(allowed))),
    check('Sem escopo Saúde, bloqueia o resumo',denied===null)
   ]
  }
 },
 {
  id:'odonto-plan',title:'Odontológico · dados de plano',group:'Contexto verificado',product:'Odonto',agent:'Clara',
  objective:'Reconhecer a modalidade e o plano usando somente o escopo de benefícios.',
  dialogue:[
   ['Cliente','Quero consultar meu plano odontológico.'],
   ['Clara','Posso usar os detalhes autorizados do plano, sem informações de procedimentos.']
  ],
  run:()=>{
   const data=only(['risk.saude.read'],'odonto','service',{benefits:{operadora:'Operadora Odonto',
    modalidade:'Empresarial',vidas:8,plano:'Odonto A',tratamentos:['SIGILO']}})
   return [
    check('Operadora autorizada',data.benefits.operadora==='Operadora Odonto'),
    check('Plano cadastrado reconhecido',data.benefits.plano_titular==='Odonto A'),
    check('Número agregado de vidas',data.benefits.quantidade_vidas===8),
    check('Não expõe tratamentos',!JSON.stringify(data).includes('SIGILO'))
   ]
  }
 },
 {
  id:'policy-only',title:'Empresarial · sem escopo de risco',group:'Segurança',product:'Empresarial',agent:'Murilo',
  objective:'Não inventar características nem aceitar resumo de risco sem permissão homologada.',
  dialogue:[
   ['Cliente','Quero uma cotação do seguro empresarial.'],
   ['Murilo','Os dados de risco autorizados não estão disponíveis. Preciso confirmar alguns detalhes.']
  ],
  run:()=>{
   const data=only(['policies.read'],'empresarial','quote',{property:{atividade:'Galpão',tipo_construcao:'Alvenaria'}})
   const result=summarizeV41VerifiedQuote([pol('empresarial',data)],'empresarial')
   const reply=replyV41VerifiedQuote(result)
   return [
    check('Resumo de risco Empresarial bloqueado',data===null),
    check('Cotação pode continuar com triagem',/não trouxe todos os detalhes/i.test(reply)),
    check('Não inventa construção nem atividade',!/Alvenaria|Galpão/i.test(reply))
   ]
  }
 },
 {
  id:'no-proof',title:'Sem validação · nome protegido',group:'Segurança',product:'Todos',agent:'Clara',
  objective:'Bloquear nome e apólice quando a identidade não foi verificada.',
  dialogue:[
   ['Cliente','Você sabe meu nome e quais seguros eu tenho?'],
   ['Clara','Para consultar o cadastro, preciso validar a identidade do titular.']
  ],
  run:()=>{
   const bogus=verified({status:'verification_required'})
   const context=v4VerifiedSummary(bogus,'service','auto')
   return [
    check('Status não verificado bloqueia contexto',context===null),
    check('Nome isolado não valida identidade',parseVerifiedProfile({nome_tratamento:'Marina',relacao_com_contrato:'titular'},[],'service')===null),
    check('Comprovante inexistente é rejeitado',!validVerificationRef('123.456.789-00'))
   ]
  }
 },
 {
  id:'expired-ref',title:'Comprovante expirado',group:'Segurança',product:'Todos',agent:'Clara',
  objective:'Expiração impede a reutilização do contexto e exige nova validação.',
  dialogue:[
   ['Cliente','Quero continuar a cotação de ontem.'],
   ['Clara','O comprovante não está mais válido para este protocolo. Precisamos validar novamente.']
  ],
  run:()=>{
   const expired=v4VerifiedSummary(verified({expires_at:new Date(Date.now()-3600000).toISOString()}),'quote','vida')
   const invalid=v4VerifiedSummary(verified({status:'verification_expired'}),'quote','vida')
   return [
    check('Timestamp vencido rejeitado',expired===null),
    check('Status expirado não confirma identidade',invalid===null),
    check('Referência com formato incorreto rejeitada',!validVerificationRef('INVALID-REF'))
   ]
  }
 },
 {
  id:'profile-scope',title:'Perfil · nome, cidade e idade',group:'Segurança',product:'Vida',agent:'Clara',
  objective:'Respeitar escopos independentes para nome, cidade e faixa etária.',
  dialogue:[
   ['Cliente','Quero uma cotação de seguro de vida.'],
   ['Clara','Após a verificação, posso utilizar somente os dados liberados para cotação.']
  ],
  run:()=>{
   const raw={nome_tratamento:'Marina',tipo_pessoa:'pf',relacao_com_contrato:'titular',
    cidade_uf:'Guarulhos/SP',faixa_etaria:'30-39',data_nascimento:'1987-05-05'}
   const quote=parseVerifiedProfile(raw,['profile.basic','profile.location','profile.age_band'],'quote','vida')
   const service=parseVerifiedProfile(raw,['profile.basic','profile.location','profile.age_band'],'service','vida')
   const notOwner=parseVerifiedProfile({...raw,relacao_com_contrato:'dependente'},['profile.basic'],'service','vida')
   return [
    check('Nome confirmado do titular',verifiedGreeting(quote).includes('Marina')),
    check('Cidade/idade somente para finalidade autorizada',quote.cidade_uf==='Guarulhos/SP'&&quote.faixa_etaria==='30-39'),
    check('Serviço não recebe localização/faixa',service.cidade_uf===undefined&&service.faixa_etaria===undefined),
    check('Dependente não assume identidade do titular',notOwner===null)
   ]
  }
 },
 {
  id:'handoff-request',title:'Clara → Murilo · pedir autorização',group:'Continuidade',product:'Auto',agent:'Ambos',
  objective:'Um pedido de cotação não representa autorização para trocar de agente.',
  dialogue:[
   ['Clara','Olá! Sou a Clara, concierge da Phoenix Insurance.'],
   ['Cliente','Quero cotar o mesmo carro em outra seguradora.'],
   ['Clara','Posso passar sua conversa ao Murilo para essa cotação?']
  ],
  run:()=>{
   const history=[fromAgent('Olá! Sou a Clara, concierge da Phoenix Insurance.'),
    fromClient('Quero cotar o mesmo carro em outra seguradora.')]
   const outcome=decideMuriloSwitch(history,'murilo')
   return [
    check('Clara continua antes do aceite',outcome?.agent==='clara'),
    check('Nenhuma transferência humana automática',outcome?.humanHandoff===false&&outcome?.handoff===null),
    check('Pergunta autorização a Murilo',/Posso encaminhar.*Murilo/i.test(outcome?.reply||''))
   ]
  }
 },
 {
  id:'handoff-accepted',title:'Clara → Murilo · aceite registrado',group:'Continuidade',product:'Auto',agent:'Ambos',
  objective:'Murilo assume só após a resposta afirmativa à oferta anterior.',
  dialogue:[
   ['Clara','Olá! Sou a Clara, concierge da Phoenix Insurance.'],
   ['Cliente','Quero uma cotação do mesmo carro.'],
   ['Clara','Posso encaminhar sua conversa ao Murilo, nosso assistente comercial?'],
   ['Cliente','Sim.'],
   ['Murilo','Vamos comparar as opções autorizadas do veículo.']
  ],
  run:()=>{
   const history=[fromAgent('Olá! Sou a Clara, concierge da Phoenix Insurance.'),
    fromClient('Quero uma cotação do mesmo carro.'),
    fromAgent('Posso encaminhar sua conversa ao Murilo, nosso assistente comercial?'),
    fromClient('Sim')]
   return [
    check('Aceite permite Murilo',decideMuriloSwitch(history,'murilo')===null),
    check('Aceite de agente não vira handoff humano',confirmedOfferHandoff(history)===null),
    check('Sem aceite não passa diretamente',decideMuriloSwitch(history.slice(0,2),'murilo')?.agent==='clara')
   ]
  }
 },
 {
  id:'handoff-refused',title:'Clara → Murilo · recusa',group:'Continuidade',product:'Auto',agent:'Ambos',
  objective:'Recusa mantém Clara e não insiste na troca.',
  dialogue:[
   ['Clara','Olá! Sou a Clara, concierge da Phoenix Insurance.'],
   ['Cliente','Quero comparar outras seguradoras.'],
   ['Clara','Posso encaminhar sua conversa ao Murilo, nosso assistente comercial?'],
   ['Cliente','Não.'],
   ['Clara','Sem problemas, continuamos por aqui.']
  ],
  run:()=>{
   const history=[fromAgent('Olá! Sou a Clara, concierge da Phoenix Insurance.'),
    fromClient('Quero comparar outras seguradoras.'),
    fromAgent('Posso encaminhar sua conversa ao Murilo, nosso assistente comercial?'),
    fromClient('Não')]
   const answer=decideMuriloSwitch(history,'murilo')
   return [
    check('Agente continua Clara',answer?.agent==='clara'),
    check('Nenhuma passagem automática',answer?.humanHandoff===false),
    check('Resposta respeita negativa',/sem problemas/i.test(answer?.reply||''))
   ]
  }
 },
 {
  id:'human-handoff-consent',title:'Atendimento humano · confirmação',group:'Consentimento',product:'Auto',agent:'Clara',
  objective:'Handoff para humano exige oferta prévia aceita, exceto pedido direto do cliente.',
  dialogue:[
   ['Cliente','Preciso de ajuda com assistência Auto.'],
   ['Clara','Posso encaminhar você à equipe de Atendimento Auto?'],
   ['Cliente','Sim.'],
   ['Clara','Agora posso solicitar a transferência ao setor.']
  ],
  run:()=>{
   const noConsent=enforceHumanHandoffConsent(handoff,[fromClient('Tenho direito a guincho?')])
   const history=[fromClient('Preciso de ajuda com assistência Auto.'),
    fromAgent('Posso encaminhar você à equipe de Atendimento Auto?'),fromClient('Sim')]
   const confirmed=confirmedOfferHandoff(history)
   return [
    check('Não transfere antes da confirmação',noConsent.humanHandoff===false),
    check('Pergunta antes de encaminhar',/Posso encaminhar/i.test(noConsent.reply)),
    check('Depois do aceite, encaminha ao setor correto',confirmed?.humanHandoff===true&&confirmed?.handoff?.department==='patrimonio')
   ]
  }
 },
 {
  id:'human-handoff-no',title:'Atendimento humano · recusa respeitada',group:'Consentimento',product:'Auto',agent:'Clara',
  objective:'Recusa expressa não produz handoff nem nova insistência.',
  dialogue:[
   ['Clara','Posso encaminhar você à equipe de Atendimento Auto?'],
   ['Cliente','Não.'],
   ['Clara','Tudo bem, não farei o encaminhamento.']
  ],
  run:()=>{
   const history=[fromAgent('Posso encaminhar você à equipe de Atendimento Auto?'),fromClient('Não')]
   const response=enforceHumanHandoffConsent(handoff,history)
   return [
    check('Recusa cancela humanHandoff',response.humanHandoff===false),
    check('Regras não enviam handoff',response.handoff===null),
    check('Resposta não insiste',/não farei o encaminhamento/i.test(response.reply))
   ]
  }
 },
 {
  id:'one-introduction',title:'Clara · apresentação uma vez',group:'Continuidade',product:'Todos',agent:'Clara',
  objective:'Preservar a apresentação inicial e remover reapresentações no protocolo.',
  dialogue:[
   ['Cliente','Oi!'],
   ['Clara','Olá! Sou a Clara, concierge da Phoenix Insurance.'],
   ['Cliente','Tenho uma dúvida sobre minha apólice.'],
   ['Clara','Claro, posso ajudar.']
  ],
  run:()=>{
   const twice='Olá! Sou a Clara, concierge da Phoenix Insurance. 💙\n\nOlá! Sou Clara, assistente virtual da Phoenix Insurance. Em que posso ajudar?'
   const cleaned=dedupeClaraIntroductions(twice)
   const inHistory=omitRepeatedAgentIntroduction('Olá! Sou a Clara, vou ajudar. Pode informar a apólice?', 'clara',true)
   return [
    check('Duas apresentações viram uma',(cleaned.match(/Sou (?:a )?Clara/gi)||[]).length===1),
    check('Pergunta útil preservada',/Em que posso ajudar\?/i.test(cleaned)),
    check('Já apresentada não repete apresentação',!/Sou a Clara/i.test(inHistory))
   ]
  }
 },
 {
  id:'change-product',title:'Mudança de assunto · Vida depois Auto',group:'Continuidade',product:'Vida',agent:'Murilo',
  objective:'Pedido explícito mais recente prevalece sobre ramo mencionado antes.',
  dialogue:[
   ['Cliente','Quero cotação do meu seguro Auto.'],
   ['Murilo','Vamos tratar do seu veículo.'],
   ['Cliente','Agora quero uma cotação de seguro de Vida.'],
   ['Murilo','Vamos tratar de Vida, sem reutilizar os detalhes de Auto.']
  ],
  run:()=>{
   const histories=[fromClient('Quero cotação do meu carro.'),
     fromAgent('Vamos conferir o veículo.'),fromClient('Agora quero cotação de seguro de vida.')]
   const target=detectV41QuoteProduct(histories)
   return [
    check('Identifica último produto explícito',target==='vida'),
    check('Não seleciona Auto por contexto antigo',target!=='auto'),
    check('Saúde Empresarial é Saúde',detectV41QuoteProduct([fromClient('Quero cotação de saúde empresarial')])==='saude')
   ]
  }
 }
]

export const UNIVERSAL_GROUPS=['Todos',...new Set(UNIVERSAL_SCENARIOS.map(x=>x.group))]

export function runUniversalScenario(id){
 const scenario=UNIVERSAL_SCENARIOS.find(x=>x.id===id)
 if(!scenario)throw Error('Cenário não encontrado.')
 try{
  const checks=scenario.run().map(c=>({name:c.name,pass:c.pass===true,detail:c.detail||''}))
  const passed=checks.filter(c=>c.pass).length
  return {id:scenario.id,title:scenario.title,product:scenario.product,group:scenario.group,
   agent:scenario.agent,objective:scenario.objective,dialogue:scenario.dialogue,
   checks,passed,total:checks.length,ok:passed===checks.length}
 }catch(e){
  return {id:scenario.id,title:scenario.title,product:scenario.product,group:scenario.group,
   agent:scenario.agent,objective:scenario.objective,dialogue:scenario.dialogue,
   checks:[{name:'Execução do cenário',pass:false,detail:'Erro técnico ao executar o avaliador.'}],
   passed:0,total:1,ok:false}
 }
}
export function runUniversalSuite(ids=UNIVERSAL_SCENARIOS.map(x=>x.id)){
 const unique=[...new Set(ids)]
 const scenarios=unique.map(runUniversalScenario)
 const passed=scenarios.reduce((sum,s)=>sum+s.passed,0)
 const total=scenarios.reduce((sum,s)=>sum+s.total,0)
 return {
  version:'megabrain-v4.1-qa',simulation:true,networkCalls:0,
  scenarios,scenarioCount:scenarios.length,passed,total,
  failed:total-passed,score:total?Math.round(passed/total*100):0,
  approved:scenarios.every(x=>x.ok)&&total>0
 }
}
export function qaReportText(report){
 const lines=[
  'PHOENIX ONE · RELATÓRIO DE HOMOLOGAÇÃO UNIVERSAL V4.1',
  'Modo: LOCAL, DETERMINÍSTICO, com dados FICTÍCIOS (sem testar LLM ou integração real).',
  'Cenários: '+report.scenarioCount+' | Verificações: '+report.passed+'/'+report.total+
   ' | Falhas: '+report.failed+' | Taxa: '+report.score+'%',
  ''
 ]
 for(const s of report.scenarios){
  lines.push((s.ok?'APROVADO':'FALHOU')+' — '+s.title+' ['+s.product+']')
  for(const c of s.checks)lines.push('  '+(c.pass?'OK':'FALHA')+' • '+c.name)
 }
 lines.push('','Este relatório não autoriza ativação em produção. A homologação com o Junior e a validação de respostas reais continuam pendentes.')
 return lines.join('\n')
}
