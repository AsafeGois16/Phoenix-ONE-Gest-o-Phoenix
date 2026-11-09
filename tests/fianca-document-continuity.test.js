import test from 'node:test'
import assert from 'node:assert/strict'
import {findInboundDocument,isDocumentResponseToIdentityRequest,handoffDepartment} from '../server/document-identity.js'
import {isFiancaClaimRequest,verifiedFiancaClaimDecision} from '../server/fianca-claim-routing.js'

const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const fakeCNPJ='11.222.333/0001-81'
const fianca='Preciso acionar meu seguro Fiança locatícia.'

test('CNPJ com e sem pontuação é válido e reconhecido após pedido explícito da Clara',()=>{
 const h=[inc(fianca),out('Pode informar o CPF ou CNPJ do titular para verificar sua identidade?')]
 for(const doc of [fakeCNPJ,'11222333000181']){
  assert.equal(findInboundDocument([...h,inc(doc)]).status,'valid')
  assert.equal(isDocumentResponseToIdentityRequest([...h,inc(doc)]),true)
 }
})
test('repetição da mesma pergunta sobre CPF não reinicia identificação',()=>{
 const history=[inc(fianca),out('Por favor, informe o CPF ou CNPJ do titular'),
  inc(fakeCNPJ),out('Recebi seu documento. Preciso que informe CPF ou CNPJ do titular.'),
  inc('11222333000181')]
 assert.equal(isDocumentResponseToIdentityRequest(history),true)
 assert.equal(findInboundDocument(history).status,'valid')
})
test('não tratar CPF/CNPJ digitado sem pedido como confirmação ou pedido de consulta',()=>{
 assert.equal(isDocumentResponseToIdentityRequest([inc(fianca),inc(fakeCNPJ)]),false)
 assert.equal(isDocumentResponseToIdentityRequest([inc('Quero cotar seguro Auto'),out('Qual é o modelo do seu carro?'),inc(fakeCNPJ)]),false)
 assert.equal(isDocumentResponseToIdentityRequest([inc(fianca),out('Não informe CPF ou CNPJ por aqui.'),inc(fakeCNPJ)]),false)
 assert.equal(isDocumentResponseToIdentityRequest([inc(fianca),out('Informe CPF ou CNPJ'),inc('CEP 12345-678')]),false)
})
test('documento inválido depois de solicitação entra no fluxo de validação de formato',()=>{
 const h=[inc(fianca),out('Pode informar CPF ou CNPJ do titular?'),inc('11.222.333/0001-82')]
 assert.equal(findInboundDocument(h).status,'invalid')
 assert.equal(isDocumentResponseToIdentityRequest(h),true)
})
test('Fiança acionamento é atendimento Auto/RE, não comercial',()=>{
 assert.equal(handoffDepartment([inc(fianca),out('Para prosseguir com acionamento de seguro Fiança')]),'patrimonio')
})
test('Fiança é acionamento, não uma cotação hipotética',()=>{
 assert.equal(isFiancaClaimRequest([inc(fianca)]),true)
 assert.equal(isFiancaClaimRequest([inc('Quero cotar seguro fiança para um apartamento')]),false)
})
test('identidade verificada com Seguro Fiança: orientação objetiva e sem promessa de cobertura',()=>{
 const r=verifiedFiancaClaimDecision([inc(fianca),out('Informe CNPJ'),inc(fakeCNPJ)],
  [{ramo:'Seguro Fiança Locatícia',seguradora:'Fictícia',numero:'SEG-123',premio_total:1000,capital_segurado:40000}])
 assert.equal(r.agent,'clara')
 assert.equal(r.humanHandoff,false)
 assert.match(r.reply,/identidade foi confirmada/i)
 assert.match(r.reply,/Auto\/RE/)
 assert.match(r.reply,/não confirma cobertura/i)
 assert.doesNotMatch(r.reply,/11.222|11222333000181|SEG-123|40000|1000|Fictícia/i)
})
test('sem contrato Fiança retornado após validação, informar ausência e oferecer humano sem inventar',()=>{
 const r=verifiedFiancaClaimDecision([inc(fianca)],[{ramo:'Vida',seguradora:'Fake'}])
 assert.match(r.reply,/não localizei um contrato de Seguro Fiança/i)
 assert.equal(r.humanHandoff,false)
 assert.match(r.reply,/Auto\/RE/)
})
test('múltiplas apólices Fiança não autorizam escolher contrato automaticamente',()=>{
 const r=verifiedFiancaClaimDecision([inc(fianca)],[{ramo:'Fiança Locatícia'},{product_code:'fianca'}])
 assert.match(r.reply,/mais de um contrato/i)
 assert.equal(r.humanHandoff,false)
})
