import test from 'node:test'
import assert from 'node:assert/strict'
import {financialSecondCopyDecision,financeDepartmentEnabled,shouldReuseProtocolDocument} from '../server/financial-routing.js'
import {enforceHumanHandoffConsent} from '../server/consent-routing.js'
import {activeMovementHistory} from '../server/backoffice-routing.js'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const fixture=()=>[
 inc('Preciso excluir minha esposa do plano de Saúde'),
 out('Posso encaminhar sua solicitação ao Backoffice?'),
 inc('Sim'),
 out('Perfeito, vou solicitar seu encaminhamento ao Backoffice.'),
 inc('111.444.777-35'),
 inc('O Backoffice já recebeu minha solicitação. Agora tenho outra dúvida.'),
 out('Claro! Como posso ajudar com a nova solicitação?'),
 inc('Gostaria de saber como funciona a segunda via de boletos do plano de saúde.')
]
const withFlag=(value,fn)=>{
 const key='PHOENIX_ONE_JUNIOR_FINANCEIRO_ENABLED',prev=process.env[key]
 if(value===null)delete process.env[key];else process.env[key]=value
 try{return fn()}finally{if(prev===undefined)delete process.env[key];else process.env[key]=prev}
}
test('sem suporte Junior para Financeiro, não inventa emissão nem transferência',()=>withFlag(null,()=>{
 assert.equal(financeDepartmentEnabled(),false)
 const r=financialSecondCopyDecision(fixture(),'clara')
 assert.equal(r.agent,'clara')
 assert.equal(r.humanHandoff,false)
 assert.equal(r.handoff,null)
 assert.match(r.reply,/Financeiro/)
 assert.match(r.reply,/relacionamento@phoenixseg.com.br/)
 assert.doesNotMatch(r.reply,/posso verificar se consigo enviar|vou emitir|vou encaminhar seu atendimento/)
 assert.doesNotMatch(r.reply,/111.444|11144477735|data de nascimento/i)
}))
test('Sim à antiga promessa de envio é corrigido sem repetir CPF e sem tratar como consentimento de transferência',()=>withFlag(null,()=>{
 const messages=[...fixture(),out('A segunda via do boleto é emitida pela seguradora. Posso verificar se consigo enviar o boleto para você?'),inc('Sim')]
 const r=financialSecondCopyDecision(messages,'clara')
 assert.equal(r.humanHandoff,false)
 assert.equal(r.handoff,null)
 assert.doesNotMatch(r.reply,/informe.*CPF|vou emitir|enviei boleto/i)
}))
test('com destino financeiro contratado, consulta de segunda via oferece encaminhamento, sem efetivar antes de sim',()=>withFlag('true',()=>{
 const r=financialSecondCopyDecision(fixture(),'clara')
 assert.equal(r.humanHandoff,false)
 assert.match(r.reply,/Posso encaminhar.*Financeiro/i)
 const yes=financialSecondCopyDecision([...fixture(),out(r.reply),inc('Sim')],'clara')
 assert.equal(yes.agent,'clara')
 assert.equal(yes.humanHandoff,true)
 assert.equal(yes.handoff.department,'financeiro')
 assert.doesNotMatch(yes.handoff.summary,/11144477735|111.444.777-35/)
 assert.equal(enforceHumanHandoffConsent(yes,[...fixture(),out(r.reply),inc('Sim')]).humanHandoff,true)
}))
test('pedido explícito ao financeiro já é consentimento, se houver fila habilitada',()=>withFlag('true',()=>{
 const h=[...fixture(),inc('Quero falar com o Financeiro para segunda via')]
 const r=financialSecondCopyDecision(h,'clara')
 assert.equal(r.humanHandoff,true)
 assert.equal(r.handoff.department,'financeiro')
 assert.equal(enforceHumanHandoffConsent(r,h).humanHandoff,true)
}))
test('dúvida de parcela não causa transferência ou segunda via automática',()=>withFlag('true',()=>{
 const h=[...fixture(),out('Como posso ajudar?'),inc('Qual o valor da parcela?')]
 assert.equal(financialSecondCopyDecision(h,'clara'),null)
}))
test('Sim após oferta de Backoffice não cria um falso handoff financeiro',()=>withFlag('true',()=>{
 const history=[...fixture(),out('Posso encaminhar sua solicitação ao Backoffice?'),inc('Sim')]
 assert.equal(financialSecondCopyDecision(history,'clara'),null)
}))
test('documento de titular no MESMO protocolo pode ser reutilizado somente como chave para nova verificação Junior',()=>{
 const all=[...fixture(),out('Como posso ajudar?'),inc('Qual o valor e vencimento do boleto do plano de saúde?')]
 const filtered=activeMovementHistory(all)
 assert.ok(filtered.length<all.length)
 assert.equal(shouldReuseProtocolDocument(all,filtered),true)
 assert.equal(shouldReuseProtocolDocument([inc('Oi'),inc('Qual o valor do boleto?')],[inc('Qual o valor do boleto?')]),false)
 assert.equal(shouldReuseProtocolDocument(all,[inc('Oi')]),false)
})
test('sem suporte financeiro, pedido humano não vai silenciosamente a Benefícios ou Backoffice',()=>withFlag(null,()=>{
 const r=financialSecondCopyDecision([...fixture(),inc('Quero que me encaminhe ao Financeiro')],'clara')
 assert.equal(r.handoff,null)
 assert.equal(r.humanHandoff,false)
 assert.match(r.reply,/ainda não consigo/i)
}))

test('pedido direto ao Financeiro sem segunda via no histórico não cai em Benefícios',()=>withFlag(null,()=>{
 const r=financialSecondCopyDecision([inc('Preciso falar com o Financeiro')],'clara')
 assert.equal(r.agent,'clara')
 assert.equal(r.humanHandoff,false)
 assert.equal(r.handoff,null)
 assert.match(r.reply,/canal oficial relacionamento@phoenixseg.com.br/)
}))
test('pedido direto ao Financeiro com contrato habilitado usa destino financeiro',()=>withFlag('true',()=>{
 const r=financialSecondCopyDecision([inc('Preciso falar com o Financeiro')],'clara')
 assert.equal(r.humanHandoff,true)
 assert.equal(r.handoff.department,'financeiro')
 assert.doesNotMatch(r.handoff.summary,/111.444|11144477735/)
}))
