import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {MODES,DEFAULT_MODE,STORAGE_KEY,normalizeMode,readPreviewMode,savePreviewMode,newPreviewProtocol,previewDecision} from '../server/orchestration-preview.js'
const only=()=>newPreviewProtocol(MODES.CLARA_ONLY)
const dual=()=>newPreviewProtocol(DEFAULT_MODE)
const ask=(s,t)=>previewDecision(s,t)
test('Orquestração: padrão compatível, valor inválido não altera preferência',()=>{
 assert.equal(DEFAULT_MODE,'clara_murilo')
 assert.equal(normalizeMode('invalid'),DEFAULT_MODE)
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}
 assert.equal(readPreviewMode(storage),DEFAULT_MODE)
 assert.equal(savePreviewMode(storage,MODES.CLARA_ONLY),true)
 assert.equal(data.get(STORAGE_KEY),'clara_only')
 assert.equal(savePreviewMode(storage,'invalid'),false)
 assert.equal(readPreviewMode(storage),'clara_only')
 assert.equal(readPreviewMode(null),DEFAULT_MODE)
 assert.equal(savePreviewMode(null,MODES.CLARA_ONLY),false)
})
test('Somente Clara: produto conhecido, proposta, aceite e nenhum envio real',()=>{
 for(const [text,product,target] of [
  ['Gostaria de cotar um seguro para meu carro.','Auto','auto_re'],
  ['Quero cotar seguro de moto.','Moto','auto_re'],
  ['Quero cotar seguro de frota de carros.','Frota','auto_re'],
  ['Quero cotar seguro residencial.','Residencial','auto_re'],
  ['Quero cotar seguro empresarial.','Empresarial','auto_re'],
  ['Quero contratar um plano de saúde empresarial.','Saúde','health'],
  ['Quero cotar plano odontológico.','Odonto','health'],
  ['Quero cotar seguro de vida.','Vida','life'],
  ['Quero cotar seguro viagem.','Viagem','other'],
  ['Quero uma cotação de seguro cyber.','Cyber','other']
 ]){
  const first=ask(only(),text)
  assert.equal(first.agent,'clara',text); assert.equal(first.decision,'offer_human',text)
  assert.equal(first.state.product,product,text);assert.equal(first.proposedTarget,target,text)
  assert.equal(first.consentPending,true);assert.equal(first.executed,false)
  assert.doesNotMatch(first.reply,/Murilo|CPF|CNPJ|placa|modelo do carro/i)
  const done=ask(first.state,'Sim')
  assert.equal(done.decision,'propose_handoff');assert.equal(done.agent,'clara')
  assert.equal(done.proposedTarget,target);assert.equal(done.executed,false)
  assert.equal(ask(done.state,'Sim').decision,'protocol_closed')
 }
})
test('Somente Clara: quando produto não informado, pergunta só o ramo; escolha ambígua não encaminha',()=>{
 const unknown=ask(only(),'Quero uma cotação.')
 assert.equal(unknown.decision,'ask_product')
 assert.equal(unknown.proposedTarget,null)
 const found=ask(unknown.state,'Seguro de vida.')
 assert.equal(found.decision,'offer_human')
 assert.equal(found.state.product,'Vida')
 const many=ask(only(),'Quero cotar seguro de carro e vida.')
 assert.equal(many.decision,'ask_product')
})
test('Somente Clara: aceite não é presumido, recusa encerra oferta e novo assunto limpa contexto',()=>{
 const offer=ask(only(),'Quero cotar seguro auto.')
 assert.equal(ask(offer.state,'Talvez').decision,'wait_for_consent')
 const denied=ask(offer.state,'Não')
 assert.equal(denied.decision,'declined');assert.equal(denied.proposedTarget,null)
 assert.equal(ask(denied.state,'Sim').proposedTarget,null)
 assert.equal(ask(offer.state,'outro assunto').decision,'new_topic')
 const changed=ask(offer.state,'Quero cotar seguro de vida.')
 assert.equal(changed.state.product,'Vida');assert.equal(changed.decision,'offer_human')
})
test('Somente Clara: pedido direto de comercial humano sem qualificação',()=>{
 const direct=ask(only(),'Quero falar com o comercial de Seguro Residencial.')
 assert.equal(direct.decision,'propose_handoff');assert.equal(direct.proposedTarget,'auto_re')
 assert.equal(direct.agent,'clara');assert.equal(direct.executed,false)
})
test('Urgência, movimentação, financeiro e atendimento existente têm prioridade nos dois modos',()=>{
 for(const mode of Object.values(MODES)){
  const initial=newPreviewProtocol(mode)
  const cases=[
   ['Houve um princípio de incêndio na minha residência.','safety_first'],
   ['Meu carro foi roubado e quero uma cotação.','safety_first'],
   ['Preciso excluir minha esposa do plano odontológico.','existing_service'],
   ['Preciso de uma segunda via do boleto.','existing_service'],
   ['Não consigo acessar minha carteirinha.','existing_service']
  ]
  for(const [text,expected] of cases){
   const r=ask(initial,text);assert.equal(r.decision,expected,text)
   assert.equal(r.agent,'clara');assert.equal(r.proposedTarget,null);assert.equal(r.executed,false)
  }
  const offer=ask(initial,'Quero cotar seguro auto.')
  assert.equal(ask(offer.state,'Preciso de uma segunda via do boleto.').decision,'existing_service')
 }
})
test('Clara + Murilo: consentimento antes de qualificar e continuidade após aceite',()=>{
 const first=ask(dual(),'Quero cotar seguro auto.')
 assert.equal(first.decision,'offer_murilo');assert.equal(first.agent,'clara')
 const confirmed=ask(first.state,'Sim')
 assert.equal(confirmed.agent,'murilo');assert.equal(confirmed.decision,'murilo_qualification')
 assert.equal(ask(confirmed.state,'Uso pessoal').agent,'murilo')
 assert.equal(ask(confirmed.state,'Preciso da segunda via do boleto.').agent,'clara')
 assert.equal(ask(first.state,'Não').decision,'declined')
})
test('Mudança do seletor não altera modo do protocolo existente; novo protocolo recebe o novo modo',()=>{
 const active=newPreviewProtocol(DEFAULT_MODE)
 const nextPreference=MODES.CLARA_ONLY
 assert.equal(ask(active,'Quero cotar seguro auto.').state.mode,DEFAULT_MODE)
 const newProtocol=newPreviewProtocol(nextPreference)
 assert.equal(ask(newProtocol,'Quero cotar seguro auto.').decision,'offer_human')
})
test('Piloto integrado não usa estado local do simulador nem habilita API na prévia',async()=>{
 const [live,gate,core]=await Promise.all([
  readFile(new URL('../api/v1/conversations/respond.js',import.meta.url),'utf8'),
  readFile(new URL('../server/orchestration-pilot.js',import.meta.url),'utf8'),
  readFile(new URL('../server/orchestration-preview.js',import.meta.url),'utf8')
 ])
 assert.match(live,/operational_preview_disabled/)
 assert.match(live,/resolvePilotMode\(body,process\.env,bridge\)/)
 assert.doesNotMatch(live,/localStorage|readPreviewMode/)
 assert.match(gate,/VERCEL_ENV!=='production'/)
 assert.match(gate,/body\.contact\?\.phone_e164!==phone/)
 assert.doesNotMatch(core,/\bfetch\s*\(|supabase\.|process\.env/)
})
