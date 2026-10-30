/**
 * Regras globais de minimização: qualificação comercial não é validação
 * documental. Não grava dados de clientes nem modifica o CRM do Junior.
 */
const fold=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
function fallbackQuestion(messages){
 const corpus=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact').slice(-12).map(m=>fold(m.text)).join(' ')
 if(/\b(?:vida|falecimento|funeral|invalidez)\b/.test(corpus))
  return 'Para avançarmos na cotação de Vida, qual valor de proteção você gostaria de avaliar? Se preferir, posso ajudar a definir uma faixa.'
 if(/\b(?:saude|plano medico|odonto|odontologico)\b/.test(corpus))
  return 'Para avançarmos na cotação de benefícios, quantas pessoas você pretende incluir?'
 if(/\b(?:auto|automovel|carro|moto|veiculo|frota)\b/.test(corpus))
  return 'Para começarmos a cotação de Auto, qual é o modelo e o ano do veículo?'
 if(/\b(?:residencial|imovel|apartamento|casa)\b/.test(corpus))
  return 'Para começarmos a cotação residencial, o imóvel é casa ou apartamento e em qual cidade fica?'
 if(/\b(?:viagem|viajar)\b/.test(corpus))
  return 'Para sua cotação de Viagem, qual é o destino e a data prevista de saída?'
 if(/\b(?:pet|cachorro|gato)\b/.test(corpus))
  return 'Para o Seguro Pet, qual a espécie e a idade aproximada do animal?'
 if(/\b(?:bike|bicicleta)\b/.test(corpus))
  return 'Para o Seguro Bike, qual é o modelo e o valor aproximado da bicicleta?'
 return 'Para avançarmos, qual é a principal proteção que você procura nesse seguro?'
}
export function refineCommercialReply(reply,messages,agent){
 const text=String(reply||'')
 if(agent!=='murilo'||!text)return text
 const normalized=fold(text)
 const requestsSensitive=/\b(?:cpf|cnpj|rg|documento com foto|foto do documento|endereco completo|endereco de correspondencia|logradouro|data de nascimento)\b/.test(normalized)&&
   /\b(?:pode|preciso|informe|informar|envie|enviar|passe|qual|mande|compartilhe|solicito|necessario)\b/.test(normalized)
 if(!requestsSensitive)return text
 // O time humano poderá coletar os dados quando necessários, em fluxo seguro.
 return 'Vamos seguir por etapas, sem solicitar documentos ou endereço completo nesta simulação. '+fallbackQuestion(messages)
}
export function refineUnverifiedIdentityClaim(reply,verified=false){
 const text=String(reply||'')
 if(!text||verified)return text
 const positive=/\b(?:sua identidade (?:foi |esta )?(?:confirmada|validada|verificada)|identidade confirmada|identidade validada|seus dados foram validados|dados cadastrais confirmados)\b/i
 if(!positive.test(fold(text)))return text
 return text.replace(positive,'Recebi suas informações, mas a validação de identidade pelo sistema ainda não foi concluída')
}
