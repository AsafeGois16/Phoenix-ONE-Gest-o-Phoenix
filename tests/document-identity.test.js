import test from 'node:test'
import assert from 'node:assert/strict'
import {cpfValid,cnpjValid,findInboundDocument,requiresPersonalLookup,scrubDocuments,handoffDepartment} from '../server/document-identity.js'
const inbound=text=>({direction:'inbound',author:'contact',text,type:'text'})
test('validacao de CPF',()=>{assert.equal(cpfValid('111.444.777-35'),true);assert.equal(cpfValid('111.444.777-36'),false);assert.equal(cpfValid('11111111111'),false)})
test('validacao de CNPJ',()=>{assert.equal(cnpjValid('11.222.333/0001-81'),true);assert.equal(cnpjValid('11.222.333/0001-82'),false);assert.equal(cnpjValid('00000000000000'),false)})
test('documento do contato e nunca telefone da conversa',()=>{
 assert.deepEqual(findInboundDocument([inbound('CPF 111.444.777-35')]),{status:'valid',type:'cpf',number:'11144477735'})
 assert.deepEqual(findInboundDocument([inbound('CNPJ 11.222.333/0001-81')]),{status:'valid',type:'cnpj',number:'11222333000181'})
 assert.equal(findInboundDocument([inbound('Telefone +55 11 98765-4321')]).status,'missing')
 assert.equal(findInboundDocument([inbound('CPF 111.444.777-36')]).status,'invalid')
})
test('mais de um documento exige esclarecimento',()=>assert.equal(findInboundDocument([inbound('111.444.777-35 e 11.222.333/0001-81')]).status,'multiple'))
test('identificadores sempre removidos do texto enviado a LLM',()=>assert.equal(scrubDocuments('CPF 111.444.777-35 CNPJ 11.222.333/0001-81'),'CPF [DOCUMENTO] CNPJ [DOCUMENTO]'))
test('consulta privada nao depende do telefone',()=>{
 assert.equal(requiresPersonalLookup([inbound('Quais seguros eu tenho?')]),true)
 assert.equal(requiresPersonalLookup([inbound('Gostaria de verificar as minhas parcelas')]),true)
 assert.equal(requiresPersonalLookup([inbound('Oi')]),false)
 assert.equal(requiresPersonalLookup([inbound('Como funciona o seguro de vida?')]),false)
})
test('documento enviado em resposta mantém intenção anterior',()=>assert.equal(requiresPersonalLookup([inbound('Quais seguros eu tenho?'),inbound('111.444.777-35')]),true))
test('setor de suporte independente de identidade por telefone',()=>{
 assert.equal(handoffDepartment([inbound('Plano odontológico')]),'beneficios')
 assert.equal(handoffDepartment([inbound('Parcelas seguro auto')]),'patrimonio')
 assert.equal(handoffDepartment([inbound('Quais seguros tenho?')]),'comercial')
})


test('CPF: prova de nascimento apenas após pergunta explicita da Clara',async()=>{
 const {extractVerificationProof,scrubVerificationProof}=await import('../server/document-identity.js')
 const q={direction:'outbound',author:'agent',text:'Pode informar sua data de nascimento no formato DD/MM/AAAA?'}
 assert.deepEqual(extractVerificationProof([inbound('111.444.777-35'),q,inbound('25/11/1990')],'cpf'),{birth_date:'1990-11-25'})
 assert.equal(extractVerificationProof([inbound('25/11/1990')],'cpf'),null)
 assert.equal(extractVerificationProof([inbound('111.444.777-35'),q,inbound('31/02/1990')],'cpf'),null)
 assert.equal(scrubVerificationProof('Nasci em 25/11/1990'),'Nasci em [DATA DE VERIFICACAO]')
})
test('CNPJ: CEP somente após pergunta explicita e nao chega ao modelo',async()=>{
 const {extractVerificationProof,scrubVerificationProof}=await import('../server/document-identity.js')
 const q={direction:'outbound',author:'agent',text:'Pode informar o CEP cadastrado (8 números)?'}
 assert.deepEqual(extractVerificationProof([inbound('11.222.333/0001-81'),q,inbound('01234-567')],'cnpj'),{cep:'01234567'})
 assert.equal(extractVerificationProof([inbound('01234-567')],'cnpj'),null)
 assert.equal(scrubVerificationProof('CEP 01234-567'),'CEP [CEP DE VERIFICACAO]')
})
