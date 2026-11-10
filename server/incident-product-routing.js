/**
 * Triagem por produto em sinistros e assistências. Contrato Junior v1.2:
 * nunca acionar serviços, confirmar cobertura ou divulgar contrato antes de
 * identity_context=verified. Handoff é só proposta, executada pelo Junior.
 */
const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const inbound=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const outbound=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const isYes=t=>/^(?:sim|s|claro|estamos seguros|estou seguro|sim, estamos seguros|sim, estou seguro|isso|pode sim)[.! ]*$/.test(fold(t))
const isNo=t=>/^(?:nao|n|nao estou|nao estamos|nao estamos seguros|nao estou seguro|ainda nao)[.! ]*$/.test(fold(t))
const quoted=t=>/\b(?:cotacao|cotar|orcamento|simulacao|simular|proposta comercial|quanto custa|preco)\b/.test(t)
const hypothetical=t=>/\b(?:se ocorrer|se acontecer|se houver|caso ocorra|caso aconteca|hipoteticamente)\b/.test(t)&&!/\b(?:aconteceu|ocorreu|houve|sofri|pegou fogo|foi roubado)\b/.test(t)
const actuallyHappened=t=>/\b(?:aconteceu|ocorreu|houve|sofri|fui|foi|teve|tive|estou|esta|bateu|bateram|colidi|roubaram|furtaram|pegou fogo|ficou doente|machucou|quebrou|caiu|perdeu|extraviad[ao]|sinistro|urgencia|emergencia|preciso de atendimento|preciso acionar)\b/.test(t)
const emergency=t=>/\b(?:ferid[oa]s?|sangramento intenso|nao respira|desmai|inconsciente|dor no peito|falta de ar|dificuldade para respirar|convulsao|incendio|fogo|chamas|fumaca|explosao|vazamento de gas|risco imediato|em perigo|atropelad|na pista)\b/.test(t)&&
 !/\b(?:sem feridos|ninguem ficou ferido|ninguem se machucou|nao houve feridos)\b/.test(t)
const safely=t=>/\b(?:estou|estamos|todos|pessoas|familia|moradores|funcionarios|equipe|pet|animal)\b.{0,60}\b(?:segur[oa]s?|fora do imovel|fora do predio|fora da via|fora da pista|em seguranca)\b/.test(t)||
 /\b(?:em local seguro|fora do imovel|fora do predio|fora da pista|fora da via|em seguranca)\b/.test(t)
const unsafe=t=>/\b(?:nao estamos seguros|nao estou seguro|ainda estamos na pista|nao saimos|ainda estamos dentro|ainda ha fogo|risco imediato|perigo agora|em risco|sem seguranca)\b/.test(t)
const needsHuman=t=>/\b(?:quero|preciso|solicito|pode|me transfira|me encaminhe|encaminhe|transfira)\b.{0,90}\b(?:humano|atendente|equipe|setor|pessoa|especialista|socorro)\b/.test(t)
const changesTopic=t=>/\b(?:agora tenho outra duvida|outro assunto|quero cotar|quero retomar a cotacao|preciso da segunda via|preciso excluir dependente)\b/.test(t)
const answer=(reply,humanHandoff=false,handoff=null)=>({agent:'clara',reply,humanHandoff,handoff})

const PROFILES={
 roubo_auto:{label:'Roubo/Furto Auto',department:'patrimonio',team:'Auto/RE',match:/\b(?:auto|automovel|carro|veiculo)\b/,
  first:'Sinto muito pelo roubo. Você está em segurança? Se o crime estiver ocorrendo ou houver ameaça, procure um local protegido e acione a Polícia Militar pelo 190. Não tente recuperar o veículo por conta própria.'},
 residencial:{label:'Sinistro Residencial',department:'patrimonio',team:'Auto/RE',match:/\b(?:residencial|residencia|imovel|casa|apartamento)\b/,
  first:'Se houver incêndio ou fumaça, saia do imóvel imediatamente, não retorne ao local e ligue 193 (Bombeiros). Todas as pessoas conseguiram sair e estão em segurança?'},
 empresarial:{label:'Sinistro Empresarial',department:'patrimonio',team:'Auto/RE',match:/\b(?:empresa|empresarial|loja|comercio|comercial|galpao|estabelecimento)\b/,
  first:'Primeiro, proteja as pessoas: se houver fogo, fumaça ou risco estrutural, evacue e acione Bombeiros 193. Os funcionários e demais pessoas estão em segurança?'},
 condominio:{label:'Sinistro Condomínio',department:'patrimonio',team:'Auto/RE',match:/\b(?:condominio|predio|portaria|area comum|sindico)\b/,
  first:'Priorize os moradores e funcionários: havendo incêndio, fumaça ou perigo estrutural, afaste as pessoas e acione Bombeiros 193. Todos estão em segurança?'},
 saude:{label:'Urgência de Saúde',department:'beneficios',team:'Benefícios',match:/\b(?:saude|hospital|internacao|urgencia medica|emergencia medica|pronto.socorro)\b/,
  first:'Entendi a urgência. Qual é a situação clínica que precisa de atendimento? Se houver risco imediato à vida, procure pronto-socorro ou SAMU 192 sem aguardar a validação do plano.'},
 moto:{label:'Sinistro Moto',department:'patrimonio',team:'Auto/RE',
  first:'Sinto muito pelo ocorrido com a moto. Alguém precisa de atendimento médico imediato? Se houver feridos ou perigo, procure socorro (SAMU 192 ou Polícia 190, conforme a situação).'},
 frota:{label:'Sinistro Frota',department:'patrimonio',team:'Auto/RE',
  first:'Vamos priorizar a equipe e os condutores: há feridos ou risco imediato no local do acidente com a frota? Se necessário, acione o socorro antes de informar documentos.'},
 equipamento:{label:'Sinistro Equipamentos',department:'patrimonio',team:'Auto/RE',
  first:'Antes de tratar do equipamento, há risco de choque, incêndio ou ferimentos? Não manuseie equipamento danificado ou energizado em situação de perigo.'},
 bike:{label:'Sinistro Bicicleta',department:'patrimonio',team:'Auto/RE',
  first:'Sinto muito pelo ocorrido com a bicicleta. Você se feriu ou precisa de atendimento médico? Se houver risco imediato, procure socorro.'},
 odonto:{label:'Urgência Odontológica',department:'beneficios',team:'Benefícios',
  first:'Entendi a urgência odontológica. Há sangramento intenso, dificuldade para respirar ou risco imediato? Se houver, procure pronto atendimento; não espere a verificação do plano.'},
 acidentes_pessoais:{label:'Sinistro Acidentes Pessoais',department:'beneficios',team:'Benefícios',
  first:'Sinto muito pelo acidente. A pessoa acidentada precisa de atendimento médico urgente? Em caso de risco imediato, procure socorro ou ligue SAMU 192.'},
 viagem:{label:'Sinistro Seguro Viagem',department:'beneficios',team:'Benefícios',
  first:'Entendi a solicitação de Seguro Viagem. Para verificar com segurança se existe apólice ativa, pode informar CPF ou CNPJ do titular? Em emergência médica, procure atendimento local imediatamente.'},
 pet:{label:'Sinistro Seguro Pet',department:'backoffice',team:'Backoffice',
  first:'Sinto muito pelo ocorrido com o pet. Ele precisa de atendimento veterinário imediato? Em caso de risco, procure uma emergência veterinária sem aguardar a consulta do seguro.'}
}
function classifyCritical(text){
 const t=fold(text)
 if(!t||hypothetical(t)||(quoted(t)&&!actuallyHappened(t)))return null
 if(/\b(?:roubad[oa]|roubo|furtad[oa]|furto|assalt[oa]|levaram meu carro|roubaram meu carro)\b/.test(t)&&
  PROFILES.roubo_auto.match.test(t)&&!/\b(?:moto|bicicleta|bike|frota)\b/.test(t))return 'roubo_auto'
 if(/\b(?:condominio|predio|portaria|sindico|area comum)\b/.test(t)&&
  /\b(?:incendio|fogo|explosao|alagamento|inundacao|vazamento|sinistro|danos|desabamento)\b/.test(t))return 'condominio'
 if(/\b(?:empresa|empresarial|loja|galpao|estabelecimento|fabrica|comercio)\b/.test(t)&&
  /\b(?:incendio|fogo|explosao|alagamento|inundacao|vazamento|roubo|furto|sinistro|danos|desabamento)\b/.test(t))return 'empresarial'
 if(/\b(?:casa|residencia|residencial|imovel|apartamento)\b/.test(t)&&
  /\b(?:incendio|fogo|explosao|fumaca|chamas|sinistro|desabamento)\b/.test(t))return 'residencial'
 if(/\b(?:plano de saude|seguro saude|saude|urgencia medica|emergencia medica|hospital|internacao|pronto.socorro)\b/.test(t)&&
  /\b(?:urgente|urgencia|emergencia|internacao|hospital|pronto.socorro|cirurgia urgente|socorro imediato|risco de vida|atendimento emergencial)\b/.test(t))return 'saude'
 return null
}
function classifyOther(text){
 const t=fold(text)
 if(!t||hypothetical(t)||(quoted(t)&&!actuallyHappened(t)))return null
 const event=/\b(?:acidente|colisao|batida|bateu|bati|atropel|queda|caiu|cai|roubo|roubad[oa]|furtad[oa]|furto|danific|quebrou|sinistro|trauma|incendio|fogo|pane|falha|machuc|doente|adoeceu|urgencia|emergencia|internacao|extraviad[ao]|extravio|bagagem perdida|mala perdida|cancelamento de voo|voo cancelado|afastamento|incapacidade|preciso de atendimento|acionar|acionamento)\b/.test(t)
 if(!event)return null
 if(/\b(?:bike|bicicleta|ciclismo|ciclista)\b/.test(t))return 'bike'
 if(/\b(?:moto|motocicleta|motociclista)\b/.test(t))return 'moto'
 if(/\b(?:frota|veiculos? utilitarios?|veiculos? da empresa|caminhao da empresa|um dos veiculos da empresa)\b/.test(t))return 'frota'
 if(/\b(?:equipamento|maquina|maquinario|notebook|computador|equipamento eletronico)\b/.test(t))return 'equipamento'
 if(/\b(?:pet|animal|cachorro|gato|veterinari[oa])\b/.test(t))return 'pet'
 if(/\b(?:odonto|odontologico|odontologica|dentario|dente|dentista|trauma dentario)\b/.test(t))return 'odonto'
 if(/\b(?:acidentes pessoais|seguro ap|dit|diaria por incapacidade|incapacidade temporaria)\b/.test(t))return 'acidentes_pessoais'
 if(/\b(?:seguro viagem|viagem|bagagem|mala|voo|passageiro)\b/.test(t))return 'viagem'
 return null
}
export function classifyProductIncident(text){
 return classifyOther(text)||classifyCritical(text)
}
export function productIncidentContext(messages){
 const list=Array.isArray(messages)?messages:[]
 for(let i=list.length-1;i>=0;i--){
  if(!inbound(list[i]))continue
  const text=fold(list[i].text)
  if(changesTopic(text)&&!actuallyHappened(text))return null
  const kind=classifyProductIncident(text)
  if(kind)return {kind,start:i,profile:PROFILES[kind]}
 }
 return null
}
const agentLast=messages=>[...messages].reverse().find(outbound)?.text||''
const identityPrompt=profile=>'Para agilizar o atendimento com a equipe de '+profile.team+', pode informar o CPF ou CNPJ do titular do seguro? A identidade será verificada pela gestão do Junior; não é necessário enviar foto do documento.'
const offer=profile=>'Posso encaminhar seu atendimento à equipe de '+profile.team+' para continuar a avaliação? Nenhum acionamento foi realizado pela IA, e a cobertura depende da análise humana.'
function serviceSummary(context){
 return 'Atendimento de '+context.profile.label+'. Triagem de segurança e identificação feitas conforme informações disponíveis. Equipe humana deve conferir risco, contrato e cobertura. Nenhum sinistro ou assistência foi acionado pela IA.'
}
function immediate(profile,ctx,messages){
 const original=fold(messages[ctx.start]?.text)
 const severe=emergency(original)
 if(profile===PROFILES.saude&&/\b(?:dor no peito|nao respira|inconsciente|convulsao|falta de ar)\b/.test(original))
  return answer('Há sinais de possível emergência. Procure pronto atendimento imediatamente ou acione SAMU 192. Posso encaminhar ao setor de Benefícios com prioridade? Não espere a validação documental para buscar socorro.')
 return answer(profile.first)
}
export function productIncidentFirstDecision(messages){
 const ctx=productIncidentContext(messages),list=Array.isArray(messages)?messages:[]
 if(!ctx||ctx.start!==list.length-1||!inbound(list.at(-1)))return null
 // Uma segunda descrição do mesmo caso não deve reiniciar a apresentação.
 // Apresentação antiga não é triagem do novo evento. Evitar apenas
 // repetição de pergunta quando já houve orientação específica sobre o caso.
 if(list.slice(ctx.start+1,-1).some(m=>outbound(m)&&/\b(?:seguranca|feridos|urgencia|veterinaria|equipamento|apolice)\b/.test(fold(m.text))))return null
 return immediate(ctx.profile,ctx,list)
}
function fleetUnitKnown(messages,ctx){
 const text=fold(messages.slice(ctx.start).filter(inbound).map(m=>m.text).join(' '))
 return /\b(?:veiculo\s*(?:n[ºo.]*)?\s*\d+|unidade\s*(?:n[ºo.]*)?\s*\d+|caminhao\s*(?:n[ºo.]*)?\s*\d+|utilitario\s*(?:n[ºo.]*)?\s*\d+|identificacao interna)\b/.test(text)
}
export function productIncidentFollowupDecision(messages){
 const ctx=productIncidentContext(messages),list=Array.isArray(messages)?messages:[],last=list.at(-1)
 if(!ctx||!inbound(last))return null
 const text=fold(last.text),prev=fold(agentLast(list)),profile=ctx.profile
 if(/\b(?:cpf|cnpj|data de nascimento|cep cadastrado)\b/.test(prev))return null
 if(/\b(?:posso encaminhar|posso transferir)\b/.test(prev))return null
 if(unsafe(text)||/\b(?:nao saimos|tem fogo|ainda na pista)\b/.test(text)){
  const help=ctx.kind==='saude'?'Se houver sinais graves, procure o pronto-socorro ou ligue SAMU 192.':
   'Se houver perigo, mantenha-se afastado e acione o serviço de emergência adequado (190 ou 193 conforme o caso).'
  return answer(help+' Posso encaminhar à equipe de '+profile.team+' com prioridade?')
 }
 if(emergency(text)&&!/\b(?:sem feridos|ninguem ficou ferido)\b/.test(text)){
  if(ctx.kind==='saude')return answer('Se houver risco imediato à vida, procure atendimento presencial de urgência ou ligue SAMU 192. Posso encaminhar à equipe de Benefícios com prioridade?')
  return answer('Há indicação de risco. Priorize sua segurança, afaste-se do local e acione Bombeiros 193 ou Polícia 190 conforme a situação. Posso encaminhar à equipe de '+profile.team+' com prioridade?')
 }
 const symptomsOrRisk=/\b(?:alguem precisa de atendimento medico|ha feridos|ha risco|precisa de atendimento medico|sangramento intenso|risco imediato|equipamento.*risco|pet.*atendimento veterinario|ele precisa de atendimento veterinario|pessoa acidentada precisa|precisa de atendimento veterinario)\b/.test(prev)
 if(symptomsOrRisk&&ctx.kind!=='saude'){
  const noInjury=/\b(?:ninguem ficou ferido|ninguem se machucou|sem feridos|nao ha feridos|nao,? ninguem|nao tem feridos)\b/.test(text)
  if(isYes(text)||(!noInjury&&/\b(?:ferido|machucado|sangrando|muito mal|correndo risco|em perigo)\b/.test(text))){
   const help=ctx.kind==='pet'?'Procure imediatamente atendimento veterinário de emergência.':
    ctx.kind==='odonto'?'Procure atendimento presencial de urgência se houver sangramento intenso, comprometimento respiratório ou risco imediato.':
     'Se houver feridos ou risco imediato, priorize o socorro adequado (SAMU 192, Bombeiros 193 ou Polícia 190, conforme o caso).'
   return answer(help+' Posso encaminhar à equipe de '+profile.team+' com prioridade, sem aguardar a validação documental?')
  }
  if(isNo(text)||noInjury||/\b(?:nao precisa de atendimento|pet esta bem|nao ha risco)\b/.test(text)){
   if(ctx.kind==='frota'&&!fleetUnitKnown(list,ctx))return answer('Qual veículo ou unidade da frota foi afetado? Pode informar uma referência interna, sem precisar compartilhar a placa completa.')
   return answer(identityPrompt(profile))
  }
 }
 if(ctx.kind==='frota'&&/\b(?:qual veiculo|qual unidade|identificacao interna|referencia interna)\b/.test(prev))
  return answer(identityPrompt(profile))
 if(ctx.kind==='viagem'&&/\b(?:cpf|cnpj)\b/.test(prev))return null
 if(ctx.kind==='saude'&&/\b(?:qual e a situacao clinica|qual e a situacao)\b/.test(prev)){
  if(/\b(?:dor no peito|falta de ar|desmai|inconsciente|convulsao|sangramento intenso)\b/.test(text))
   return answer('Essa situação pode exigir socorro imediato. Procure pronto-socorro ou ligue SAMU 192. Posso encaminhar seu atendimento à equipe de Benefícios com prioridade?')
  return answer(identityPrompt(profile))
 }
 if(/\b(?:seguranca|em seguranca|estao em seguranca|esta em seguranca|seguro\?|conseguiram sair|todas as pessoas|todos estao)\b/.test(prev)){
  if(isYes(text)||safely(text)||/\b(?:ninguem ferido|sem feridos)\b/.test(text))return answer(identityPrompt(profile))
  if(isNo(text))return answer('Priorize a segurança das pessoas. Se houver perigo imediato, acione o socorro adequado; posso encaminhar à equipe de '+profile.team+' com prioridade?')
 }
 if(needsHuman(text)){
  if(ctx.kind==='saude'&&/\b(?:urgencia|emergencia)\b/.test(fold(agentLast(list))))return answer('Se houver risco à vida, procure socorro imediato. Posso encaminhar à equipe de Benefícios com prioridade?')
  return answer(identityPrompt(profile))
 }
 return null
}
function matchingPolicy(policy,kind){
 const code=fold([policy?.ramo,policy?.linha,policy?.product_code].filter(Boolean).join(' '))
 const matches={
  roubo_auto:/\b(?:auto|automovel|veiculo|carro)\b/,
  residencial:/\b(?:residencial|habitacional)\b/,
  empresarial:/\b(?:empresarial|comercio|multirrisco)\b/,
  condominio:/\bcondominio\b/,
  saude:/\b(?:saude|medico|hospitalar|assistencia medica)\b/,
  moto:/\b(?:moto|motocicleta|automovel|auto)\b/,
  frota:/\b(?:frota|auto|veiculo|caminhao)\b/,
  equipamento:/\b(?:equipamento|maquinas|riscos diversos|patrimonial|eletronico)\b/,
  bike:/\b(?:bike|bicicleta|ciclismo|riscos diversos)\b/,
  odonto:/\b(?:odonto|odontologico|odontologia)\b/,
  acidentes_pessoais:/\b(?:acidentes pessoais|acidentes pessoais coletivo|vida|dit|acidente pessoal)\b/,
  viagem:/\b(?:viagem|travel)\b/,
  pet:/\b(?:pet|animal|veterinario)\b/
 }
 return matches[kind]?.test(code)===true
}
export function productIncidentVerifiedDecision(messages,policies){
 const ctx=productIncidentContext(messages)
 if(!ctx)return null
 const matched=(Array.isArray(policies)?policies:[]).filter(p=>matchingPolicy(p,ctx.kind))
 const status=matched.length===1?'Foi localizado um contrato da categoria indicada na consulta autorizada. ':
  matched.length>1?'Há mais de um contrato dessa categoria; a equipe confirmará qual se aplica. ':
  'A consulta não identificou um contrato dessa categoria; a equipe humana poderá conferir o cadastro. '
 const caveat=ctx.kind==='acidentes_pessoais'?' A equipe verificará se há cobertura de Diária por Incapacidade Temporária (DIT) na apólice, sem presumir que esteja contratada. ':''
 return answer('A identidade foi confirmada pela gestão. '+status+caveat+offer(ctx.profile))
}
export function enrichProductIncidentHandoff(decision,messages){
 const ctx=productIncidentContext(messages)
 if(!ctx||decision?.humanHandoff!==true||decision?.handoff?.department!==ctx.profile.department)return decision
 return {...decision,agent:'clara',handoff:{...decision.handoff,reason:'Encaminhamento humano de '+ctx.profile.label,summary:serviceSummary(ctx).slice(0,350)}}
}
