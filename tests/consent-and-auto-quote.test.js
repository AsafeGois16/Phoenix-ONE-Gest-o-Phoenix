import test from 'node:test'
import assert from 'node:assert/strict'
import {decideMuriloSwitch,enforceHumanHandoffConsent,confirmedOfferHandoff,isHumanHandoffConfirmed} from '../server/consent-routing.js'
import {isSameCarQuote,summarizeVerifiedAutoForQuote,sameCarQuoteReply} from '../server/auto-quote-continuity.js'
import {readFileSync} from 'node:fs'
const inbound=text=>({direction:'inbound',author:'contact',text})
const outbound=text=>({direction:'outbound',author:'agent',text})
const intro=outbound('Olá! Sou Clara, assistente virtual da Phoenix Insurance. Em que posso ajudar?')
const handoff={agent:'clara',reply:'Vou encaminhar agora.',humanHandoff:true,handoff:{department:'patrimonio',reason:'Dúvida do cliente',summary:'Orientação Auto'}}
test('pedido de cotação do mesmo carro não é consentimento para trocar Clara por Murilo',()=>{
 const history=[inbound('Oi'),intro,inbound('Eu posso fazer cotação do mesmo carro em outra seguradora?')]
 const result=decideMuriloSwitch(history,'murilo')
 assert.equal(result.agent,'clara')
 assert.equal(result.humanHandoff,false)
 assert.match(result.reply,/Posso encaminhar.*Murilo/)
})
test('após aceite explícito de troca para Murilo, o fluxo comercial prossegue',()=>{
 const history=[inbound('Oi'),intro,inbound('Quero cotação do mesmo carro'),outbound('Posso encaminhar sua conversa ao Murilo, nosso assistente comercial?'),inbound('Sim')]
 assert.equal(decideMuriloSwitch(history,'murilo'),null)
 assert.equal(confirmedOfferHandoff(history),null,'aceite para o Murilo nunca pode virar transferência humana')
})
test('negação mantém atendimento com Clara sem encaminhamento',()=>{
 const h=[intro,inbound('Quero cotar carro'),outbound('Posso encaminhar sua conversa ao Murilo para ajudar na cotação?'),inbound('Não')]
 const out=decideMuriloSwitch(h,'murilo')
 assert.equal(out.agent,'clara')
 assert.equal(out.humanHandoff,false)
})
test('handoff humano não autorizado vira pergunta e não pausa agente',()=>{
 const out=enforceHumanHandoffConsent(handoff,[inbound('Quero informação de guincho')])
 assert.equal(out.humanHandoff,false)
 assert.equal(out.handoff,null)
 assert.match(out.reply,/Posso encaminhar/)
})
test('aceite humano funciona apenas após oferta anterior (ou pedido direto)',()=>{
 const invitation=outbound('Posso encaminhar você à equipe de Atendimento Auto para orientação?')
 const h=[inbound('Guincho'),invitation,inbound('Sim')]
 assert.equal(isHumanHandoffConfirmed(h),true)
 const accepted=confirmedOfferHandoff(h)
 assert.equal(accepted.humanHandoff,true)
 assert.equal(accepted.handoff.department,'patrimonio')
 assert.equal(enforceHumanHandoffConsent(handoff,h).humanHandoff,true)
 assert.equal(isHumanHandoffConfirmed([inbound('Sim')]),false)
 assert.equal(isHumanHandoffConfirmed([inbound('Não')]),false)
 assert.equal(isHumanHandoffConfirmed([inbound('Quero falar com um atendente')]),true)
})
test('seleção de plano não é automaticamente autorização para entregar ticket',()=>{
 const h=[inbound('Quero incluir dependente'),outbound('Qual plano deseja, 1 ou 2?'),inbound('2')]
 const res=enforceHumanHandoffConsent({...handoff,handoff:{...handoff.handoff,department:'backoffice'}},h)
 assert.equal(res.humanHandoff,false)
 assert.match(res.reply,/Posso encaminhar.*Backoffice/)
})
test('cotação de veículo existente detectada somente em intenção real de cotação',()=>{
 const h=[inbound('Eu posso fazer a cotação do mesmo carro porém em outra seguradora?')]
 assert.equal(isSameCarQuote(h),true)
 assert.equal(isSameCarQuote([inbound('Tenho direito a guincho?')]),false)
})
test('dados de veículo só vêm de apólice verificada e campos autorizados',()=>{
 const summary=summarizeVerifiedAutoForQuote([
 {ramo:'Automóvel',seguradora:'Bradesco',numero:'APÓLICE-TESTE',veiculo:{marca:'Toyota',modelo:'Corolla',ano_modelo:2022,placa:'NÃO MOSTRAR'}},
 {ramo:'Vida',seguradora:'Allianz',veiculo:{marca:'Não mostrar',modelo:'Outro'}}
 ])
 assert.equal(summary.model,'Corolla')
 assert.equal(summary.modelYear,'2022')
 const response=sameCarQuoteReply(summary)
 assert.match(response,/Toyota Corolla 2022/)
 assert.doesNotMatch(response,/APÓLICE-TESTE|NÃO MOSTRAR|Bradesco/)
})
test('sem modelo/ano, Murilo não inventa veículo nem repete dados já validados',()=>{
 const summary=summarizeVerifiedAutoForQuote([{ramo:'Automóvel',seguradora:'Bradesco',veiculo:null}])
 const reply=sameCarQuoteReply(summary)
 assert.match(reply,/cadastro autorizado/)
 assert.match(reply,/não trouxe modelo e ano/i)
 assert.doesNotMatch(reply,/Corolla|Onix|2024/)
})
test('ambiguidade entre vários veículos não escolhe aleatoriamente o seguro',()=>{
 const summary=summarizeVerifiedAutoForQuote([{ramo:'Automóvel'},{ramo:'Automóvel'}])
 assert.equal(summary.status,'multiple_auto')
 assert.match(sameCarQuoteReply(summary),/mais de um seguro Auto/)
})
test('proteção e continuidade estão integradas no endpoint real antes de qualquer resposta',()=>{
 const route=readFileSync(new URL('../api/v1/conversations/respond.js',import.meta.url),'utf8')
 assert.match(route,/payload=enforceHumanHandoffConsent\(payload,body\.messages\)/)
 assert.match(route,/confirmedOfferHandoff\(body\.messages\)/)
 assert.match(route,/decideMuriloSwitch\(body\.messages,agent\)/)
 assert.match(route,/juniorIdentityContext\(body\.conversation_id,body\.protocolo,priorDocument,null/)
 assert.match(route,/verifiedAuto\.status==='verified'/)
 const bridge=readFileSync(new URL('../supabase/functions/phoenix-one-bridge/index.ts',import.meta.url),'utf8')
 assert.match(bridge,/veiculo:/)
 assert.doesNotMatch(bridge,/placa:cleanString|renavam:cleanString|chassi:cleanString/)
})
