/**
 * Detecta uma cotação/renovação de seguro Auto quando o cliente cita
 * marca/modelo/ano em vez da palavra "carro" ou "seguro Auto".
 *
 * Somente mensagens do cliente; a presença de marca/ano sozinha NÃO basta
 * para atribuir uma cotação: exige intenção explícita de seguro/renovação.
 * Não consulta placa, CPF, banco nem imagem. Um produto misto permanece
 * ambíguo para detectSdrQuoteProduct.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/g,' ').trim()
const vehicleMakers=/\b(?:chevrolet|gm|volkswagen|vw|toyota|hyundai|fiat|ford|honda|renault|nissan|jeep|citroen|peugeot|volvo|bmw|audi|mercedes(?:[- ]benz)?|kia|mitsubishi|suzuki|chery|caoa|byd|gwm|land rover|porsche)\b/
const familiarModels=/\b(?:onix|prisma|tracker|spin|cruze|corolla|yaris|etios|hilux|hb20|creta|tucson|argo|mobi|uno|strada|toro|pulse|fastback|gol|polo|nivus|virtus|saveiro|t.?cross|up|ka|fiesta|ecosport|ranger|civic|city|fit|hr.?v|kicks|versa|sentra|kwid|sandero|duster|compass|renegade|commander|208|2008|c3|c4)\b/
export function isAutoInsuranceFromVehicleDescription(text){
 const s=fold(text)
 const sales=/\b(?:seguro|apolice|cotacao|cotar|orcamento|renovacao|renovar|renovando|contratar|contratacao)\b/.test(s)
 if(!sales)return false
 const vehicle=/\b(?:veiculo|carro|automovel|moto|motocicleta)\b/.test(s)
 if(vehicle)return true
 const years=[...s.matchAll(/\b(?:19[7-9]\d|20[0-4]\d)\b/g)]
 if(years.length===0)return false
 // Em pedidos de seguro com posse explícita ("seguro do meu Logan 2021"),
 // qualquer modelo informado junto ao ano é válido, sem catálogo fechado.
 // Evita inferir Auto a partir de um ano solto ou de uma contratação não relacionada.
 const describedOwnVehicle=/\b(?:seguro|apolice)\s+(?:do|da|para o|para a)\s+(?:meu|minha)\s+[a-z][a-z0-9-]{1,28}\s+(?:19[7-9]\d|20[0-4]\d)\b/.test(s)
 if(describedOwnVehicle)return true
 // Marca/modelo + ano devem estar próximos dentro do mesmo texto.
 return [vehicleMakers,familiarModels].some(re=>{
  const matches=[...s.matchAll(new RegExp(re.source,'g'))]
  return matches.some(m=>years.some(y=>y.index>=m.index&&y.index-m.index<55))
 })
}
