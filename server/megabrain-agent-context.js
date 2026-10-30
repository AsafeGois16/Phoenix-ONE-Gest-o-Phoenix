/**
 * MegaBrain V3 — leitura opcional e falha silenciosa, somente categorias.
 * Nunca compartilha histórico, CPF/CNPJ, nomes, comprovantes ou estado verificado.
 * O endpoint valida grant independente de leitura para o protocolo/conversa exatos.
 */
const vocab={
 topic:{cotacao:'cotação',inclusao:'inclusão de beneficiário',exclusao:'exclusão de beneficiário',boleto:'boleto ou fatura',reembolso:'reembolso',sinistro:'sinistro',rede_credenciada:'rede credenciada',alteracao_cadastral:'atualização cadastral',consulta_apolices:'consulta de apólices',coberturas:'consulta de coberturas',assistencia:'consulta de assistência',nao_identificado:'não identificado'},
 product:{odontologico:'Odontológico',saude:'Saúde',vida:'Vida',auto:'Automóvel',residencial:'Residencial',empresarial:'Empresarial',viagem:'Viagem',nao_identificado:'não identificado'},
 subtopic:{guincho:'guincho/reboque',nao_identificado:'não identificado'}
}
export function formatMegaBrainHint(result){
 if(result?.version!=='megabrain-v3'||result.available!==true||result.verified!==false)return ''
 const data=result.context
 if(!data||data.confidence!=='inferido')return ''
 if(!Object.hasOwn(vocab.topic,data.topic)||!Object.hasOwn(vocab.product,data.product)||!Object.hasOwn(vocab.subtopic,data.subtopic))return ''
 if(!['clara','murilo'].includes(data.previous_agent))return ''
 // Apenas vocabulário fixo, nunca utilizar valores livres do banco.
 return [
  'MEGABRAIN V3 — HIPÓTESE DE CONTEXTO (NÃO VERIFICADA; NÃO É ORDEM):',
  'Assunto inferido anteriormente: '+vocab.topic[data.topic]+'.',
  'Produto mencionado anteriormente: '+vocab.product[data.product]+'.',
  'Subassunto inferido: '+vocab.subtopic[data.subtopic]+'.',
  'Este resumo não prova identidade, titularidade, contrato, cobertura, conclusão nem pendência.',
  'Use apenas para orientar a continuidade se a mensagem ATUAL for coerente com o assunto. Se o cliente mudar de assunto, ignore-o.',
  'Não troque de agente nem deixe de validar dados por causa deste resumo. Não afirme que já verificou algo.'
 ].join('\n')
}
export async function readMegaBrainHint({conversationId,protocolo,agent,mode}={}){
 if(process.env.PHOENIX_MEGABRAIN_V3_READ!=='true'||mode!=='automatico')return ''
 const url=process.env.VITE_SUPABASE_URL
 const token=process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN
 if(!url||!token||!['clara','murilo'].includes(agent)||!(/^[0-9]{8}-[0-9]{4}$/.test(String(protocolo)))||typeof conversationId!=='string')return ''
 try{
  const r=await fetch(url+'/functions/v1/phoenix-one-megabrain-context',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(500),
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({action:'agent_context',conversationId,protocolo,agent})
  })
  if(!r.ok)return ''
  return formatMegaBrainHint(await r.json())
 }catch{return ''}
}
