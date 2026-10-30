/**
 * MegaBrain V2 — extração determinística de contexto NÃO SENSÍVEL.
 * A fonte continua sendo o histórico do Junior recebido para responder.
 * Nunca grava mensagens, nomes, CPF/CNPJ, telefones, endereço ou documentos.
 * Não confirma identidade e NÃO influencia a decisão de Clara/Murilo.
 */
const topics=[
 ['cotacao',/\b(cota(?:ção|cao|r|ções|coes)|orçamento|orcamento|proposta|contratar|quero seguro|preço de seguro)\b/i],
 ['inclusao',/\b(inclus(?:ão|ao)|incluir|adicionar dependente|cadastrar benefici[aá]rio)\b/i],
 ['exclusao',/\b(exclus(?:ão|ao)|excluir|retirar dependente|cancelar benefici[aá]rio)\b/i],
 ['boleto',/\b(boleto|segunda via|2ª via|fatura|vencimento|parcela)\b/i],
 ['reembolso',/\b(reembolso|reembolsar)\b/i],
 ['sinistro',/\b(sinistro|colis[aã]o|roubo do ve[ií]culo|assist[eê]ncia 24)\b/i],
 ['rede_credenciada',/\b(rede credenciada|m[eé]dico|hospital|cl[ií]nica|laborat[oó]rio)\b/i],
 ['alteracao_cadastral',/\b(altera(?:ção|cao) cadastral|atualizar cadastro|corrigir meus dados)\b/i],
]
const products=[
 ['odontologico',/\b(odonto(?:l[oó]gico)?|dent[aá]rio|dentista)\b/i],
 ['saude',/\b(sa[uú]de|plano de sa[uú]de|m[eé]dico)\b/i],
 ['vida',/\b(vida|invalidez|seguro de vida)\b/i],
 ['auto',/\b(auto|carro|autom[oó]vel|ve[ií]culo|moto)\b/i],
 ['residencial',/\b(resid[eê]ncia|residencial|casa|apartamento)\b/i],
 ['empresarial',/\b(empresarial|empresa|patrimonial)\b/i],
 ['viagem',/\b(viagem|viajar)\b/i],
]
const safeMessages=messages=>Array.isArray(messages)?messages.filter(m=>m&&m.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string').slice(-12).map(m=>m.text.slice(0,1200)):[]
export function buildMegaBrainObservation({messages,reply='',agent='clara',humanHandoff=false}={}){
 const texts=safeMessages(messages)
 if(!texts.length||!['clara','murilo'].includes(agent))return null
 // Priorizar a intenção expressa recentemente, não um produto mencionado
 // num assunto antigo, reduzindo contaminação da memória entre solicitações.
 const recent=texts.slice(-4).reverse()
 const topic=recent.flatMap(t=>topics.filter(([,rx])=>rx.test(t)).map(([name])=>name))[0]||'nao_identificado'
 const product=recent.flatMap(t=>products.filter(([,rx])=>rx.test(t)).map(([name])=>name))[0]||'nao_identificado'
 const hasContext=topic!=='nao_identificado'||product!=='nao_identificado'
 if(!hasContext)return null // saudações não criam resumos artificiais
 const waitingIdentity=/\b(CPF|CNPJ|validar.*identidade|identifica(?:ção|cao) do titular)\b/i.test(reply)
 const waitingCustomer=!humanHandoff&&/\?/.test(reply)
 const next_step=humanHandoff?'acompanhar_encaminhamento':waitingIdentity?'validar_titular':waitingCustomer?'aguardar_cliente':'continuar_atendimento'
 const pending=humanHandoff?'encaminhamento_proposto':waitingIdentity?'validacao_pendente':waitingCustomer?'resposta_pendente':'nao_identificada'
 const facts=[]
 if(topic!=='nao_identificado')facts.push('assunto_identificado')
 if(product!=='nao_identificado')facts.push('produto_mencionado')
 return {agent,topic,product,next_step,pending,facts,confidence:'inferido',source:'mensagem_cliente',observed_at:new Date().toISOString()}
}
/**
 * Captura passiva totalmente opt-in por variável de ambiente.
 * Falhas nunca chegam ao cliente nem interrompem o atendimento.
 */
export async function shadowObserveMegaBrain({conversationId,protocolo,messages,reply,agent,humanHandoff}={}){
 if(process.env.PHOENIX_MEGABRAIN_SHADOW!=='true')return false
 const url=process.env.VITE_SUPABASE_URL
 const token=process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN
 const observation=buildMegaBrainObservation({messages,reply,agent,humanHandoff})
 if(!url||!token||!observation)return false
 try{
  const response=await fetch(url+'/functions/v1/phoenix-one-megabrain-context',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(650),
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({action:'observe',conversationId,protocolo,observation})
  })
  return response.ok
 }catch{return false}
}
