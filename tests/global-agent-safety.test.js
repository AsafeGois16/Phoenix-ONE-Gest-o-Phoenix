import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyConversationIntent,selectConversationAgent,hasExplicitConversationIntent} from '../server/agent-routing.js'
import {refineCommercialReply,refineUnverifiedIdentityClaim} from '../server/global-agent-safety.js'
const m=text=>({direction:'inbound',author:'contact',type:'text',text})
const agent=(history,last)=>selectConversationAgent({agent_hint:'clara',contact:{kind:'desconhecido'},messages:[...history.map(m),m(last)]})
test('cotação de Vida: indenização e assistência funeral mantém Murilo',()=>{
 const history=['Quero fazer uma cotação de seguro de vida','Quero coberturas de falecimento']
 assert.equal(classifyConversationIntent('Indenização por falecimento e assistência funeral familiar'),'neutral')
 assert.equal(agent(history,'Indenização por falecimento e assistência funeral familiar'),'murilo')
 assert.equal(agent(history,'Quero incluir assistência funeral na cotação'),'murilo')
})
test('acionar assistência funeral após falecimento é operacional',()=>{
 assert.equal(agent(['Quero fazer cotação de Vida'],'Minha mãe faleceu e preciso acionar assistência funeral'),'clara')
 assert.equal(agent([], 'Preciso de assistência agora'),'clara')
})
test('Assistência 24 horas durante cotação Auto e Residencial não dispara Clara',()=>{
 assert.equal(agent(['Quero cotar seguro Auto'],'Quero assistência 24 horas na proposta'),'murilo')
 assert.equal(agent(['Quero cotar residencial'],'Preciso avaliar cobertura e assistência 24h'),'murilo')
})
test('matriz comercial de todos os produtos permanece com Murilo',()=>{
 const examples=[
  'Vida','Auto','Residencial','Saúde','Odonto','Frota','Seguro Viagem',
  'Pet','Bike','Seguro empresarial','Responsabilidade Civil','Seguro Equipamentos',
  'Previdência privada','Seguro Garantia','Fiança locatícia'
 ]
 for(const product of examples){
  assert.equal(agent([],'Quero fazer uma cotação de '+product),'murilo',product)
  assert.equal(agent(['Quero fazer uma cotação de '+product],'Pode me explicar melhor as opções?'),'murilo',product)
 }
})
test('operações de seguros existentes continuam Clara após interesse comercial',()=>{
 for(const input of [
  'Preciso da segunda via do boleto',
  'Quero incluir minha filha como dependente no plano de Saúde',
  'Quero solicitar reembolso do meu plano',
  'Quero acionar o seguro porque sofri um acidente',
  'Preciso da carteirinha do plano',
  'Preciso de autorização para cirurgia'
 ])assert.equal(agent(['Quero fazer uma cotação Auto'],input),'clara',input)
})
test('intenção comercial presente no histórico prevalece sobre memória stale',()=>{
 assert.equal(hasExplicitConversationIntent([m('Quero cotar Vida'),m('assistência funeral familiar')]),true)
 assert.equal(hasExplicitConversationIntent([m('Oi'),m('tudo bem')]),false)
})
test('Murilo não pode pedir CPF endereço ou nascimento durante qualificação inicial',()=>{
 const history=[m('Quero cotar Vida'),m('Cobertura de falecimento e assistência funeral')]
 const invasive='Para seguir com a cotação, preciso de nome completo, CPF e endereço de correspondência. Pode me informar?'
 const out=refineCommercialReply(invasive,history,'murilo')
 assert.doesNotMatch(out,/cpf|endereço completo|endere[cç]o de correspond[eê]ncia/i)
 assert.match(out,/valor de proteção/)
})
test('guardas de privacidade funcionam em vários ramos',()=>{
 const examples=[
  [['Quero cotar Auto'],'Preciso de seu CPF para cotar','modelo e o ano'],
  [['Quero seguro Saúde empresarial'],'Informe seu CNPJ e endereço completo','quantas pessoas'],
  [['Quero cotar Residencial'],'Qual seu endereço completo e data de nascimento?','casa ou apartamento'],
  [['Quero cotar Viagem'],'Me passe CPF e RG','destino'],
  [['Quero seguro para minha bike'],'Poderia informar seu CPF?','modelo'],
 ]
 for(const [turns,reply,expected] of examples){
  const out=refineCommercialReply(reply,turns.map(m),'murilo')
  assert.match(out,new RegExp(expected,'i'))
  assert.doesNotMatch(out,/preciso de seu cpf|me passe cpf|informe seu cnpj|qual seu endereço completo/i)
 }
})
test('perguntas comerciais legítimas são mantidas',()=>{
 const a='Para uma primeira análise, qual é a cidade e a idade aproximada do segurado?'
 assert.equal(refineCommercialReply(a,[m('Quero cotar Vida')],'murilo'),a)
 assert.equal(refineCommercialReply(a,[m('Quero cotar Vida')],'clara'),a)
})
test('sem confirmação da API não declarar que identidade foi validada',()=>{
 assert.match(refineUnverifiedIdentityClaim('Sua identidade foi confirmada. Vamos continuar.',false),/ainda não foi concluída/)
 assert.match(refineUnverifiedIdentityClaim('Identidade confirmada.',false),/ainda não foi concluída/)
 assert.equal(refineUnverifiedIdentityClaim('Identidade confirmada.',true),'Identidade confirmada.')
})
test('negação honesta não é modificada',()=>{
 const honest='Não consegui confirmar sua identidade; vou encaminhar ao Backoffice.'
 assert.equal(refineUnverifiedIdentityClaim(honest,false),honest)
})
