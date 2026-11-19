import {mkdirSync,writeFileSync} from 'node:fs'
// This branch never bundles the production frontend or VITE values.
mkdirSync('dist',{recursive:true})
writeFileSync('dist/index.html','<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Phoenix ONE | Integração isolada</title><main><h1>Phoenix ONE — integração conjunta</h1><p>Preparação técnica. Endpoint bloqueado. Não inserir dados de clientes.</p></main></html>')
