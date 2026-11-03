/**
 * MegaBrain V4.1 - universal, strictly allowlisted product context.
 * THIS IS NOT A KNOWLEDGE MEMORY: no stored documents, policy IDs, names,
 * addresses, clinical details, drivers, insured persons or beneficiaries.
 * The Junior remains the sole source of verified policy/risk information.
 * Unknown product-specific fields are intentionally omitted.
 */
export const V41_RISK_SCOPES=Object.freeze({
 auto:{scope:'risk.auto.read',kind:'vehicle'},
 moto:{scope:'risk.auto.read',kind:'vehicle'},
 frota:{scope:'risk.frota.read',kind:'fleet'},
 residencial:{scope:'risk.residencial.read',kind:'property'},
 vida:{scope:'risk.vida.read',kind:'insured_person'},
 ap:{scope:'risk.vida.read',kind:'insured_person'},
 saude:{scope:'risk.saude.read',kind:'benefits'},
 odonto:{scope:'risk.saude.read',kind:'benefits'}
})
export const V41_POLICY_ONLY=Object.freeze([
 'empresarial','vida_grupo','previdencia','viagem','pet','bike','fianca',
 'garantia','rc','outros'
])
const brief=(x,max=75)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max&&
 /^[\p{L}\p{M}\p{N} .(),/-]+$/u.test(x.trim())&&
 !/\b(?:cpf|cnpj|renavam|chassi|placa|nascimento|diagnostico|endereco|paciente)\b/i.test(x)?
 x.trim():null
const numeric=(x,max)=>Number.isFinite(x)&&x>=0&&x<=max?x:null
const year=x=>Number.isInteger(x)&&x>=1970&&x<=new Date().getFullYear()+2?x:null
const count=x=>Number.isInteger(x)&&x>=0&&x<=100000?x:null
const code=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,28}$/.test(x)?x:null
const month=x=>Number.isInteger(x)&&x>=1&&x<=12?x:null
const nonempty=o=>o&&Object.values(o).some(v=>v!==null&&v!==undefined&&(!Array.isArray(v)||v.length>0))
function vehicle(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return null
 const data={
  marca:brief(v.marca,50),modelo:brief(v.modelo,65),marca_modelo:brief(v.marca_modelo,80),
  versao:brief(v.versao,65),ano_fabricacao:year(v.ano_fabricacao),
  ano_modelo:year(v.ano_modelo),zero_km:typeof v.zero_km==='boolean'?v.zero_km:null
 }
 return nonempty(data)?data:null
}
function fleet(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 // Multiple insured vehicles are NEVER automatically narrowed to the first.
 const items=Array.isArray(raw.items)?raw.items.slice(0,50).map(v=>({
  item_ref:code(v?.item_ref),numero_item:count(v?.numero_item),
  marca_modelo:brief(v?.marca_modelo,80),ano_modelo:year(v?.ano_modelo)
 })).filter(nonempty):[]
 const total=count(raw.quantidade_itens_ativos)
 return total!==null||items.length?{quantidade_itens_ativos:total,items}:null
}
function property(raw,scope,purpose){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const d={tipo_ocupacao:brief(raw.tipo_ocupacao),atividade_risco:brief(raw.atividade_risco)}
 if(scope.includes('profile.location')&&['quote','assistance'].includes(purpose)){
  d.cidade_uf=typeof raw.cidade_uf==='string'&&/^[\p{L}\p{M} .'-]{2,65}\/[A-Z]{2}$/u.test(raw.cidade_uf)?raw.cidade_uf:null
  d.cep_prefixo=typeof raw.cep_prefixo==='string'&&/^\d{5}$/.test(raw.cep_prefixo)?raw.cep_prefixo:null
 }
 return nonempty(d)?d:null
}
function insured(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const d={capital_segurado:numeric(raw.capital_segurado,1e12)}
 return nonempty(d)?d:null
}
function benefits(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const d={
  operadora:brief(raw.operadora,75),modalidade:brief(raw.modalidade,75),
  mes_reajuste:month(raw.mes_reajuste),
  quantidade_vidas:count(raw.quantidade_vidas),
  plano_titular:brief(raw.plano_titular,75)
 }
 return nonempty(d)?d:null
}
/**
 * Only a validated, verified and purpose-scoped policy is admissible.
 * Returned objects can safely be passed to the language model as *data*,
 * never as commands, proof of coverage or action authorization.
 */
export function sanitizeV41Risk(policy,scopes,purpose){
 if(!policy||typeof policy!=='object'||!Array.isArray(scopes))return null
 if(!['service','assistance','quote','policies_and_installments'].includes(purpose))return null
 const rule=V41_RISK_SCOPES[policy.product_code]
 if(!rule||!scopes.includes(rule.scope))return null
 const risk=policy.risk_summary
 if(!risk||typeof risk!=='object'||Array.isArray(risk))return null
 const value=rule.kind==='vehicle'?vehicle(risk.vehicle):
  rule.kind==='fleet'?fleet(risk.fleet):
  rule.kind==='property'?property(risk.property,scopes,purpose):
  rule.kind==='insured_person'?insured(risk.insured_person):
  rule.kind==='benefits'?benefits(risk.benefits):null
 return value?{[rule.kind]:value}:null
}
const cleaned=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const productWords=[
 ['frota',/\b(?:frota|varios veiculos|carros da empresa)\b/],
 ['auto',/\b(?:auto|automovel|carro|veiculo)\b/],
 ['moto',/\b(?:moto|motocicleta)\b/],
 ['residencial',/\b(?:residencial|casa|apartamento|imovel|residencia)\b/],
 ['vida_grupo',/\b(?:vida em grupo|vida empresarial|seguro de vida coletivo)\b/],
 ['vida',/\b(?:vida|seguro de vida)\b/],
 ['ap',/\b(?:acidentes pessoais)\b/],
 ['saude',/\b(?:saude|plano de saude|medico)\b/],
 ['odonto',/\b(?:odonto|odontologico|dental)\b/],
 ['empresarial',/\b(?:empresarial|empresa|comercio|loja|galpao)\b/],
 ['previdencia',/\b(?:previdencia|vgbl|pgbl)\b/],
 ['viagem',/\b(?:viagem)\b/],['pet',/\b(?:pet)\b/],
 ['bike',/\b(?:bike|bicicleta)\b/],
 ['fianca',/\b(?:fianca)\b/],['garantia',/\b(?:seguro garantia)\b/],
 ['rc',/\b(?:responsabilidade civil)\b/]
]
export function detectV41QuoteProduct(messages){
 const text=(Array.isArray(messages)?messages:[]).filter(m=>m?.author==='contact'&&m?.direction==='inbound')
  .slice(-12).reverse().map(m=>cleaned(m.text))
 // Latest *explicit* quotation request controls the product. "Sim" is not one.
 for(const message of text){
  if(!/\b(?:cotac[aã]o|cotar|orcamento|proposta|outra seguradora|comparar seguradoras|renovacao)\b/.test(message))continue
  for(const [code,regex] of productWords)if(regex.test(message))return code
 }
 return null
}
const headings={
 auto:'Automóvel',moto:'Moto',frota:'Frota',residencial:'Residencial',
 empresarial:'Empresarial',vida:'Vida',ap:'Acidentes Pessoais',
 saude:'Saúde',odonto:'Odontológico',vida_grupo:'Vida em Grupo',
 previdencia:'Previdência',viagem:'Viagem',pet:'Pet',bike:'Bicicleta',
 fianca:'Fiança',garantia:'Garantia',rc:'Responsabilidade Civil',outros:'Seguro'
}
export function summarizeV41VerifiedQuote(policies,product){
 const entries=Array.isArray(policies)?policies.filter(p=>p&&p.product_code===product):[]
 if(entries.length===0)return {status:'not_available',product}
 if(entries.length>1)return {status:'multiple',product,count:entries.length}
 const risk=entries[0].risk_summary
 return {status:'found',product,risk:risk&&typeof risk==='object'?risk:null}
}
export function replyV41VerifiedQuote(summary){
 if(!summary)return null
 const label=headings[summary.product]||'Seguro'
 if(summary.status==='multiple')return 'Encontrei mais de uma apólice de '+label+' na consulta autorizada. Para não escolher o risco errado, qual contrato você deseja cotar?'
 if(summary.status!=='found')return null
 const r=summary.risk||{}
 let sentence=null
 if(r.vehicle){
  const v=r.vehicle
  const model=[v.marca,v.modelo].filter(Boolean).join(' ')||v.marca_modelo
  const details=[model,v.ano_modelo].filter(Boolean).join(' ')
  if(details)sentence='Pelo cadastro autorizado, identifiquei '+details+'. Confirma que é esse veículo?'
 }
 if(r.fleet)sentence='O cadastro autorizado indica uma frota. Qual dos veículos deseja cotar? Não vou selecionar automaticamente um item.'
 if(r.property&&r.property.tipo_ocupacao)sentence='O imóvel consta com ocupação '+r.property.tipo_ocupacao+'. Confirma que é esse imóvel que deseja cotar?'
 if(r.insured_person&&r.insured_person.capital_segurado!==null)sentence='Há um capital segurado informado no cadastro. Quer manter esse capital como referência para a nova cotação?'
 if(r.benefits){
  const description=[r.benefits.operadora,r.benefits.modalidade].filter(Boolean).join(' — ')
  if(description)sentence='Encontrei os dados autorizados do seu plano'+(description?': '+description:'')+'. Deseja usá-los como referência na cotação?'
 }
 if(sentence)return 'Claro! Podemos cotar seu '+label+' em outras condições. '+sentence
 return 'Claro! Podemos cotar seu '+label+'. O cadastro autorizado não trouxe todos os detalhes necessários para a cotação. Vou perguntar apenas o que estiver faltando, sem presumir coberturas ou características.'
}
