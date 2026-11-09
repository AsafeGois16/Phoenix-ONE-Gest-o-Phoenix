import test from 'node:test'
import assert from 'node:assert/strict'
import {documentContinuationState,repeatsDocumentRequest,noRepeatAfterVerified} from '../server/document-continuity.js'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const cnpj='11.222.333/0001-81'
const cpf='111.444.777-35'
const products=[
 'Seguro Fiança','Seguro Auto','Seguro Frota','Seguro Residencial',
 'Seguro Empresarial','Plano Saúde','Plano Odontológico',
 'Seguro de Vida','Seguro Viagem','Seguro Pet','Seguro Bike',
 'Seguro Garantia','Seguro de Responsabilidade Civil','Seguro Rural',
 'Seguro de Transportes','Seguro Cibernético','Previdência'
]
test('todos os ramos: CPF/CNPJ solicitado e respondido não deve cair no modelo sem validação',()=>{
 for(const product of products){
  const msg=[inc('Preciso de ajuda com o acionamento do '+product),
   out('Para continuar, poderia informar o CPF ou CNPJ do titular do contrato?'),
   inc(cnpj)]
  const d=documentContinuationState(msg,'clara')
  assert.ok(d,product)
  assert.equal(d.kind,'document',product)
  assert.equal(d.document.status,'valid',product)
  assert.equal(d.document.type,'cnpj',product)
  assert.equal(d.document.number,'11222333000181',product)
 }
})
test('aceita CPF e CNPJ pontuados ou só com dígitos',()=>{
 for(const value of [cpf,'11144477735',cnpj,'11222333000181']){
  const state=documentContinuationState([
   inc('Preciso consultar meu seguro'),
   out('Pode informar CPF/CNPJ do titular?'),inc(value)
  ],'clara')
  assert.equal(state.document.status,'valid',value)
 }
})
test('CNPJ repetido não exige novo documento e continua validação no Junior',()=>{
 const msg=[inc('Quero acionar meu Seguro Fiança'),
  out('Pode informar CPF/CNPJ para consultar o cadastro?'),inc(cnpj),
  out('Recebi seu documento; poderia informar o CNPJ do titular novamente?'),inc('11222333000181'),
  out('Por favor informe o número de CPF ou CNPJ do titular.'),inc('11.222.333/0001-81')]
 const state=documentContinuationState(msg,'clara')
 assert.equal(state.kind,'document')
 assert.equal(state.document.status,'valid')
})
test('data de nascimento e CEP são provas extras; usam documento anterior, não repedem CPF/CNPJ',()=>{
 const cnpjFlow=[inc('Quero tratar de Seguro Fiança'),
  out('Informe CPF/CNPJ do titular para consulta'),inc(cnpj),
  out('Por favor, informe o CEP cadastrado (8 números).'),inc('01234-567')]
 const result=documentContinuationState(cnpjFlow,'clara')
 assert.equal(result.kind,'proof')
 assert.equal(result.document.number,'11222333000181')
 const cpfFlow=[inc('Preciso consultar Seguro Auto'),out('Pode informar CPF/CNPJ do titular?'),
  inc(cpf),out('Para confirmar a identidade, pode informar sua data de nascimento?'),inc('25/11/1990')]
 const birth=documentContinuationState(cpfFlow,'clara')
 assert.equal(birth.kind,'proof')
 assert.equal(birth.document.number,'11144477735')
})
test('documento isolado NÃO é motivo para consulta sem pedido prévio expresso da Clara',()=>{
 for(const msg of [
  [inc('Gostaria de cotar Seguro Auto'),out('Qual a cidade?'),inc(cnpj)],
  [inc('Quero contratar seguro Vida'),out('Qual a cobertura desejada?'),inc(cpf)],
  [inc('Já consultei meu Seguro Fiança'),out('Você precisa de mais informações?'),inc(cnpj)]
 ]){
  assert.equal(documentContinuationState(msg,'clara'),null)
 }
 assert.equal(documentContinuationState([inc('Preciso cotar Auto'),out('Informe CPF/CNPJ'),inc(cnpj)],'murilo'),null)
})
test('novo assunto posterior a identificação não reabre automaticamente verificação antiga',()=>{
 const msg=[inc('Quais seguros eu tenho?'),out('Informe CPF/CNPJ'),inc(cpf),
  out('Identidade confirmada. Seu Auto consta na consulta.'),inc('Quero cotar uma Frota')]
 assert.equal(documentContinuationState(msg,'clara'),null)
})
test('documento com formato inválido gera decisão invalid, sem abrir consulta ou aceitar como autenticado',()=>{
 const state=documentContinuationState([
  inc('Quero acionar Seguro Fiança'),out('Informe CPF ou CNPJ do titular?'),inc('11222333000182')
 ],'clara')
 assert.ok(state)
 assert.equal(state.document.status,'invalid')
})
test('não interpreta negacão de necessidade de CPF como pedido de documento',()=>{
 const msg=[inc('Quero cotar seguro Auto'),out('Não preciso do CPF para essa cotação.'),inc(cpf)]
 assert.equal(documentContinuationState(msg,'clara'),null)
})
test('modelo pedindo novamente documento após verified é barrado',()=>{
 assert.equal(repeatsDocumentRequest('Por favor, informe o número do CPF ou CNPJ para prosseguir.'),true)
 assert.equal(repeatsDocumentRequest('Poderia me encaminhar seu CNPJ novamente?'),true)
 assert.equal(repeatsDocumentRequest('Já recebi o CPF informado, não é necessário enviá-lo novamente.'),false)
 assert.equal(repeatsDocumentRequest('Você e o veículo estão em local seguro?'),false)
 const fallback=noRepeatAfterVerified([inc('Preciso acionar Seguro Fiança')])
 assert.match(fallback,/identidade foi confirmada/i)
 assert.match(fallback,/não precisa reenviar/i)
 assert.match(fallback,/Auto\/RE/i)
 assert.doesNotMatch(fallback,/apólice encontrada|sinistro aberto|guincho acionado/i)
})


test('pedido de serviço com documento no primeiro contato pode validar sem pedir o número novamente',()=>{
 for(const text of [
  'Preciso acionar meu Seguro Fiança. CNPJ: '+cnpj,
  'Quero consultar a apólice de Vida do titular. CPF: '+cpf,
  'Gostaria de verificar meu contrato de Seguro Residencial. CPF: '+cpf
 ]){
  const d=documentContinuationState([inc(text)],'clara')
  assert.ok(d,text)
  assert.equal(d.document.status,'valid')
 }
})
test('CPF/CNPJ espontâneo durante cotação comercial não autoriza consulta de carteira',()=>{
 for(const text of [
  'Quero cotar seguro Auto novo. Meu CNPJ é '+cnpj,
  'Gostaria de fazer uma simulação de seguro Empresarial com CPF '+cpf,
  'Quero contratar seguro Vida, tenho CPF '+cpf
 ]){
  assert.equal(documentContinuationState([inc(text)],'clara'),null,text)
 }
})
