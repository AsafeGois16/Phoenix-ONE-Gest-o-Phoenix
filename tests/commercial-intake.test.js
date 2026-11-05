import test from 'node:test'
import assert from 'node:assert/strict'
import {clientDeclaredName,nameIntakeDecision,alignAutoReHandoff,guardCommercialQuoteClosing} from '../server/commercial-intake.js'

const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const clara=out('Olá! Sou a Clara, assistente virtual da Phoenix Insurance. Como posso te chamar?')
const murilo=out('Sou o Murilo, do time comercial da Phoenix Insurance.')
const transfer=(department='comercial')=>({agent:'murilo',reply:'Vou solicitar atendimento humano.',humanHandoff:true,handoff:{department,reason:'Cotação de Auto',summary:'Cotação Auto Onix 2023, uso particular, Guarulhos, com assistências.'}})

test('Clara solicita nome no primeiro contato mesmo com nome de perfil disponível no contrato',()=>{
 const decision=nameIntakeDecision([inc('Oi, bom dia!')],'clara')
 assert.equal(decision.agent,'clara')
 assert.match(decision.reply,/como posso te chamar/i)
 assert.equal(decision.humanHandoff,false)
})
test('primeira cotação Auto continua com a Clara até pedir o nome',()=>{
 const decision=nameIntakeDecision([inc('Quero cotar seguro Auto para Onix 2023')],'murilo')
 assert.equal(decision.agent,'clara')
 assert.match(decision.reply,/como posso te chamar/i)
})
test('Clara solicita nome que faltava antes de passar cotação ao Murilo',()=>{
 const decision=nameIntakeDecision([inc('Oi'),out('Olá! Sou a Clara. Como posso ajudar?'),inc('Quero cotar seguro Auto')],'murilo')
 assert.equal(decision.agent,'clara')
 assert.match(decision.reply,/como posso te chamar/i)
})
test('nomes explícitos são reconhecidos sem repetir pergunta',()=>{
 assert.equal(clientDeclaredName([inc('Oi, meu nome é Asafe Gois. Quero cotar seguro Auto.')]),'Asafe Gois')
 assert.equal(clientDeclaredName([inc('Pode me chamar de Ana Clara')]),'Ana Clara')
 const afterName=nameIntakeDecision([inc('Quero cotar seguro Auto'),clara,inc('Asafe Gois')],'murilo')
 assert.equal(afterName.agent,'clara')
 assert.match(afterName.reply,/Posso passar.*Murilo/i)
 assert.doesNotMatch(afterName.reply,/Sou a Clara/i)
})
test('resposta curta à pergunta da Clara constitui nome, mas um sim não',()=>{
 assert.equal(clientDeclaredName([inc('Oi'),clara,inc('Asafe Gois')]),'Asafe Gois')
 assert.equal(clientDeclaredName([inc('Oi'),clara,inc('Sim')]),null)
})
test('cotação inicial com nome informado segue com aceite Clara→Murilo',()=>{
 const decision=nameIntakeDecision([inc('Me chamo Luiza. Quero fazer cotação Auto')],'murilo')
 assert.equal(decision.agent,'clara')
 assert.match(decision.reply,/Posso (?:encaminhar|passar).*Murilo/i)
})
test('se Clara já perguntou nome uma vez, não bloqueia o cliente que preferir não informar',()=>{
 assert.equal(nameIntakeDecision([inc('Oi'),clara,inc('Prefiro não informar')],'murilo'),null)
})
test('não bloquear emergência por pergunta de nome',()=>{
 assert.equal(nameIntakeDecision([inc('Acidente com feridos, preciso de socorro')],'clara'),null)
})
test('não bloquear pedido explícito de atendimento humano',()=>{
 assert.equal(nameIntakeDecision([inc('Quero falar com atendente humano')],'clara'),null)
})
test('Murilo já em atendimento não volta à Clara apenas para pedir nome',()=>{
 assert.equal(nameIntakeDecision([inc('Quero cotar Auto'),murilo,inc('Quero proteger meu carro')],'murilo'),null)
})
test('cotação de Auto vai para a fila patrimonial Auto/RE com nome confirmado',()=>{
 const messages=[inc('Oi'),clara,inc('Asafe Gois'),inc('Quero cotar seguro Auto para meu Onix 2023'),murilo,inc('Encaminhe minha cotação ao consultor humano')]
 const result=alignAutoReHandoff(transfer(),messages)
 assert.equal(result.handoff.department,'patrimonio')
 assert.match(result.handoff.summary,/Nome informado pelo cliente: Asafe Gois/)
 assert.match(result.handoff.summary,/Onix 2023/)
 assert.equal(result.humanHandoff,true)
})
test('novo seguro residencial também pertence a Auto/RE',()=>{
 const result=alignAutoReHandoff(transfer(),[inc('Preciso de cotação de seguro residencial')])
 assert.equal(result.handoff.department,'patrimonio')
})
test('Vida e Saúde seguem Comercial, sem mudança de destino',()=>{
 const v=alignAutoReHandoff(transfer(),[inc('Quero cotar seguro de vida')])
 assert.equal(v.handoff.department,'comercial')
})
test('movimentação Backoffice não pode virar Auto/RE só porque se mencionou carro',()=>{
 const base=transfer('backoffice')
 assert.equal(alignAutoReHandoff(base,[inc('Quero cotar Auto'),inc('Quero excluir um dependente')]),base)
})
test('sem decisão de transferência, o backend nunca cria handoff',()=>{
 const base={agent:'murilo',reply:'Quer seguir?',humanHandoff:false,handoff:null}
 assert.equal(alignAutoReHandoff(base,[inc('Quero cotar Auto')]),base)
})
test('sem nome declarado não inventa nome a partir de metadados',()=>{
 const result=alignAutoReHandoff(transfer(),[inc('Quero cotar seguro Auto')])
 assert.match(result.handoff.summary,/Nome de tratamento ainda não informado/)
})

test('promessa fictícia de retorno vira pedido de autorização ao Auto/RE',()=>{
 const messages=[inc('Quero cotar seguro Auto'),clara,inc('Asafe Gois'),inc('Meu carro é um Onix 2023, em Guarulhos'),murilo,inc('Padrão')]
 const payload={agent:'murilo',reply:'Vou consolidar suas informações para preparar sua cotação e retorno em breve com as opções disponíveis.',humanHandoff:false,handoff:null}
 const result=guardCommercialQuoteClosing(payload,messages)
 assert.equal(result.humanHandoff,false)
 assert.equal(result.handoff,null)
 assert.match(result.reply,/Posso encaminhar.+Auto\/RE/i)
 assert.doesNotMatch(result.reply,/retorno em breve/i)
})
test('pergunta comercial adequada não é substituída pela oferta de encaminhamento',()=>{
 const base={agent:'murilo',reply:'Qual a cidade de circulação do veículo?',humanHandoff:false,handoff:null}
 assert.equal(guardCommercialQuoteClosing(base,[inc('Quero cotar seguro Auto')]),base)
})
test('cotação que não é Auto/RE não sofre reescrita automática',()=>{
 const base={agent:'murilo',reply:'Vou preparar sua cotação e retorno em breve com opções.',humanHandoff:false,handoff:null}
 assert.equal(guardCommercialQuoteClosing(base,[inc('Quero cotar seguro de vida')]),base)
})
