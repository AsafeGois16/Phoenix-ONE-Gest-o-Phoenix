/**
 * Continuidade da cotação Auto, somente após revalidação via identity/resolve
 * para o MESMO protocolo e conversa. Não aceita seguro por inferência da IA.
 * Nunca utiliza placa, chassi, nome, CPF ou número de apólice em mensagem.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const safe=s=>typeof s==='string'&&/^[\p{L}\p{N} .()/-]{1,60}$/u.test(s.trim())?s.trim():null
const year=x=>Number.isInteger(x)&&x>=1970&&x<=new Date().getFullYear()+2?String(x):typeof x==='string'&&/^(?:19[7-9]\d|20[0-4]\d)$/.test(x)?x:null
export function isSameCarQuote(messages){
 const inbound=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m?.author==='contact').slice(-10).map(m=>fold(m.text))
 return inbound.some(t=>/\b(?:cotac[aã]o|cotar|orcamento|outra seguradora|comparar seguradoras)\b/.test(t)&&
  /\b(?:mesmo carro|mesmo veiculo|meu carro|meu automovel|outro seguro auto)\b/.test(t))
}
export function summarizeVerifiedAutoForQuote(policies){
 const auto=(Array.isArray(policies)?policies:[]).filter(p=>/\b(?:autom[oó]vel|auto|ve[ií]culo|carro|moto)\b/i.test([p?.ramo,p?.linha].join(' ')))
 if(!auto.length)return {status:'no_auto'}
 if(auto.length>1)return {status:'multiple_auto'}
 const p=auto[0],v=p?.veiculo&&typeof p.veiculo==='object'?p.veiculo:{}
 const brand=safe(v.marca),model=safe(v.modelo),modelYear=year(v.ano_modelo)
 const manufactureYear=year(v.ano_fabricacao)
 return {status:'found',brand,model,modelYear,manufactureYear,insurer:safe(p.seguradora)}
}
export function sameCarQuoteReply(summary){
 if(summary?.status==='multiple_auto')return 'Posso cotar em outras seguradoras, sim. Encontrei mais de um seguro Auto autorizado; para não usar o veículo errado, qual dos carros você deseja comparar?'
 if(summary?.status!=='found')return null
 const label=[summary.brand,summary.model,summary.modelYear].filter(Boolean).join(' ')
 if(label){
  return 'Claro! Vou ajudar a comparar outras seguradoras para o mesmo veículo. Pelo cadastro autorizado, identifiquei '+label+'. Confirma que é esse carro que deseja cotar?'
 }
 return 'Claro! Podemos aproveitar seu seguro Auto já localizado. O cadastro autorizado nesta consulta ainda não trouxe modelo e ano do veículo. Pode me informar apenas esses dados para prepararmos a comparação, sem repetir as informações já confirmadas?'
}
