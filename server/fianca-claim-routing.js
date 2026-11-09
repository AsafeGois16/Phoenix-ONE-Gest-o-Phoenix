/**
 * Acionamento de Seguro Fiança: após a gestão do Junior confirmar identidade,
 * oferecer encaminhamento ao setor Auto/RE sem prometer registro, indenização
 * ou cobertura. Não consulta ou guarda CNPJ, CEP nem outros dados pessoais.
 */
const fold=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export function isFiancaClaimRequest(messages){
 const list=Array.isArray(messages)?messages:[]
 const relevant=list.filter(m=>typeof m?.text==='string'&&
  ((m.direction==='inbound'&&m.author==='contact')||(m.direction==='outbound'&&m.author==='agent')))
 const context=fold(relevant.slice(-16).map(m=>m.text).join(' '))
 const product=/\b(?:fianca|fianca locaticia|seguro fianca)\b/.test(context)
 const action=/\b(?:acionar|acionamento|sinistro|indenizacao|indenizar|aviso de sinistro|comunicar ocorrencia)\b/.test(context)
 return product&&action
}
export function verifiedFiancaClaimDecision(messages,policies){
 if(!isFiancaClaimRequest(messages))return null
 const found=(Array.isArray(policies)?policies:[]).filter(p=>{
  const label=fold([p?.ramo,p?.linha,p?.product_code].filter(Boolean).join(' '))
  return /\bfianca\b/.test(label)
 })
 let prefix='A sua identidade foi confirmada no sistema da Phoenix. '
 if(found.length===1)prefix+='A consulta identificou um contrato de Seguro Fiança. '
 else if(found.length>1)prefix+='A consulta identificou mais de um contrato de Seguro Fiança; será necessário confirmar qual deles se aplica. '
 else prefix+='Não localizei um contrato de Seguro Fiança nos dados disponíveis para esta consulta. '
 return {
  agent:'clara',
  reply:prefix+'Isso não confirma cobertura, direito à indenização nem abertura de sinistro. Posso encaminhar seu atendimento à equipe Auto/RE para conferir o contrato e orientar o acionamento?',
  humanHandoff:false,
  handoff:null
 }
}
