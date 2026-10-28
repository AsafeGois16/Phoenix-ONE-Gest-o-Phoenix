/** CPF/CNPJ are record identifiers, not proof of identity. No persistence or logging. */
export function digits(v){return String(v||'').replace(/\D/g,'')}
export function cpfValid(v){
 const d=digits(v);if(!/^\d{11}$/.test(d)||/^(\d)\1{10}$/.test(d))return false
 const check=n=>{let sum=0;for(let i=0;i<n;i++)sum+=Number(d[i])*(n+1-i);const x=sum*10%11;return x===10?0:x}
 return Number(d[9])===check(9)&&Number(d[10])===check(10)
}
export function cnpjValid(v){
 const d=digits(v);if(!/^\d{14}$/.test(d)||/^(\d)\1{13}$/.test(d))return false
 const w1=[5,4,3,2,9,8,7,6,5,4,3,2],w2=[6,...w1]
 const check=(n,w)=>{let sum=0;for(let i=0;i<n;i++)sum+=Number(d[i])*w[i];const mod=sum%11;return mod<2?0:11-mod}
 return Number(d[12])===check(12,w1)&&Number(d[13])===check(13,w2)
}
const DOCUMENTS=/(?<!\d)(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{14}|\d{11})(?!\d)/g
export function findInboundDocument(messages){
 const msgs=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string')
 for(let i=msgs.length-1;i>=0;i--){
  const nums=[...new Set(Array.from(msgs[i].text.matchAll(DOCUMENTS),x=>digits(x[0])))]
  if(!nums.length)continue
  if(nums.length!==1)return {status:'multiple'}
  const num=nums[0],type=num.length===11?'cpf':num.length===14?'cnpj':null
  if(type&&(type==='cpf'?cpfValid(num):cnpjValid(num)))return {status:'valid',type,number:num}
  return {status:'invalid'}
 }
 return {status:'missing'}
}
export function scrubDocuments(t){return String(t||'').replace(DOCUMENTS,'[DOCUMENTO]')}
export function requiresPersonalLookup(history){
 return (Array.isArray(history)?history:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact').slice(-6).some(m=>
  /(?:ap[oó]lic|seguro[s]? (?:eu tenho|tenho|contratad)|seguro[s]? em meu nome|minha[s]? parcela|meu[s]? boleto|meus? pagamentos?|meus? seguros?|minhas? ap[oó]lices?|venciment|fatura|pagamento|cobran[cç]a|carteirinha|plano[s]? em meu nome|meus? contratos?)/i.test(m.text||''))
}
export function handoffDepartment(history){
 const text=(Array.isArray(history)?history:[]).slice(-6).map(m=>m?.text||'').join(' ').toLowerCase()
 if(/sa[uú]de|odont|benefici[aá]r|dependente|inclus[aã]o|plano de sa[uú]de/.test(text))return 'beneficios'
 if(/auto|autom[oó]vel|residencial|frota|patrimonial|sinistro|inc[eê]ndio/.test(text))return 'patrimonio'
 return 'comercial'
}
