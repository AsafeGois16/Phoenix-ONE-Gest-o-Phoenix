const labels={
 pedido_de_dados:'possível pedido de dados pessoais',
 acao_operacional_nao_disponivel:'afirmação de ação operacional indisponível',
 oferta_de_acao_indisponivel:'oferta de ação indisponível',
 consulta_nao_disponivel:'afirmação de consulta indisponível',
 retorno_ou_inicio_nao_confirmado:'promessa de contato ou início sem confirmação',
 documentos_ou_inicio_nao_confirmados:'documentos ou início de processo sem confirmação',
 prazo_nao_confirmado:'prazo sem confirmação'
}
export function labGuardFeedback(reasons){
 const detected=[...new Set(Array.isArray(reasons)?reasons:[])].map(x=>labels[x]).filter(Boolean)
 return 'Proteção do laboratório aplicada: '+(detected.length?detected.join('; '):'conteúdo sinalizado pelo filtro')+'. Exibimos uma orientação segura. A detecção automática precisa de revisão; não equivale à aprovação da resposta original.'
}
