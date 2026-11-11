// Roteamento editorial da Grazy Copy: IDs verificáveis e intenção de portfólio.
// Sem leitura de dados, sem alteração de prompt ou de permissões. Não usar para outros agentes.
export function chooseGrazySourceId(query){
  if(typeof query!=='string')return null
  const sourceIds=[...new Set((query.match(/\bPHX-GC-0[1-7]\b/gi)||[]).map(x=>x.toUpperCase()))]
  // Múltiplos documentos explícitos exigem recuperação temática normal; não
  // substituir uma solicitação de duas fontes por apenas uma delas.
  if(sourceIds.length>1)return null
  if(sourceIds.length===1)return sourceIds[0]
  const portfolio=/\bportf[oó]lio\b/i.test(query)&&/\b(phoenix|seguro|empresarial|empresa|benef[ií]cio)/i.test(query)
  const enterpriseList=/seguros?\s+e\s+benef[ií]cios?\s+empresariais/i.test(query)
  const fullCompanyList=/\blista\s+completa\b/i.test(query)&&/\b(categorias?|seguros?|produtos?|benef[ií]cios?)\b/i.test(query)&&/\bempresariais\b/i.test(query)
  return portfolio||enterpriseList||fullCompanyList?'PHX-GC-02':null
}
