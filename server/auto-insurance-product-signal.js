/**
 * Detecta uma cotação/renovação de seguro Auto quando o cliente cita
 * marca/modelo/ano em vez da palavra "carro" ou "seguro Auto".
 * A forma "renovar o seguro do meu Logan 2021" deve ser reconhecida mesmo
 * quando o catálogo de modelos não contém aquele modelo específico.
 *
 * Somente mensagens do cliente; a presença de marca/ano sozinha NÃO basta
 * para atribuir uma cotação: exige intenção explícita de seguro/renovação.
 * Não consulta placa, CPF, banco nem imagem. Um produto misto permanece
 * ambíguo para detectSdrQuoteProduct.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/g,' ').trim()
const vehicleMakers=/\b(?:chevrolet|gm|volkswagen|vw|toyota|hyundai|fiat|ford|honda|renault|nissan|jeep|citroen|peugeot|volvo|bmw|audi|mercedes(?:[- ]benz)?|kia|mitsubishi|suzuki|chery|caoa|byd|gwm|land rover|porsche)\b/
const familiarModels=/\b(?:onix|prisma|tracker|spin|cruze|corolla|yaris|etios|hilux|hb20|creta|tucson|argo|mobi|uno|strada|toro|pulse|fastback|gol|polo|nivus|virtus|saveiro|t.?cross|up|ka|fiesta|ecosport|ranger|civic|city|fit|hr.?v|kicks|versa|sentra|kwid|logan|sandero|duster|compass|renegade|commander|208|2008|c3|c4)\b/
// Lista de modelos nunca será exaustiva. Reconhecer também frases explícitas
// de renovação do "seguro do meu [Modelo] [Ano]" sem inferir Auto a partir
// de uma data, marca, seguro de vida, residência ou equipamento.
function explicitVehicleRenewal(text){
 const source=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 if(!/\b(?:renovar|renovacao|renovando|cotar|cotacao|orcamento|comparar|contratar)\b/i.test(source))return false
 const pattern=/\b(?:seguro|apolice)\s+(?:do|da|de)\s+(?:meu|minha)\s+([A-Za-z][A-Za-z0-9-]{2,}(?:\s+[A-Za-z][A-Za-z0-9-]{2,}){0,2})\s+(?:19[7-9]\d|20[0-4]\d)\b/gi
 const notAuto=/\b(?:casa|apartamento|imovel|residencia|condominio|predio|galpao|sala|loja|empresa|comercio|vida|saude|plano|pet|cachorro|gato|celular|telefone|smartphone|iphone|notebook|computador|tablet|equipamento|maquina|camera|bicicleta|bike|relogio|instrumento)\b/i
 for(const match of source.matchAll(pattern)){
  const description=match[1]
  if(notAuto.test(description))continue
  const words=description.split(/\s+/)
  // Um nome de modelo tem pelo menos uma palavra com grafia de nome próprio,
  // como Logan, Renegade, City ou DOLPHIN; uma categoria genérica não basta.
  if(words.some(word=>/^[A-Z][A-Za-z0-9-]{2,}$/.test(word)))return true
 }
 return false
}

export function isAutoInsuranceFromVehicleDescription(text){
 const s=fold(text)
 const sales=/\b(?:seguro|apolice|cotacao|cotar|orcamento|renovacao|renovar|renovando|contratar|contratacao)\b/.test(s)
 if(!sales)return false
 const vehicle=/\b(?:veiculo|carro|automovel|moto|motocicleta)\b/.test(s)
 if(vehicle)return true
 const years=[...s.matchAll(/\b(?:19[7-9]\d|20[0-4]\d)\b/g)]
 if(years.length===0)return false
 // Marca/modelo + ano devem estar próximos dentro do mesmo texto.
 if([vehicleMakers,familiarModels].some(re=>{
  const matches=[...s.matchAll(new RegExp(re.source,'g'))]
  return matches.some(m=>years.some(y=>y.index>=m.index&&y.index-m.index<55))
 }))return true
 return explicitVehicleRenewal(text)
}
