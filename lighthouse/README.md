# Relatório Lighthouse

Gerado em 2026-10-21T17:39:04.177Z com Lighthouse 13.5.0 (Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36).
Ambiente: Windows_NT 10.0.26200 (x64), 12 CPUs, Node v24.17.0.
Cada linha é a **mediana de 3 execuções**. Build: vite build (produção) servido por vite preview. Cenário: default (mocks MSW ativos, sem latência artificial).
Throttling: padrão do Lighthouse (mobile: Slow 4G + CPU 4x; desktop: preset desktop).

Metas: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90.

| Página | Perfil | Perf. | A11y | Best Pr. | SEO | LCP (ms) | CLS | TBT (ms) | Metas atingidas |
|---|---|---|---|---|---|---|---|---|---|
| home | mobile | 99 | 96 | 96 | 92 | 1629 | 0 | 37 | sim |
| detalhe | mobile | 94 | 97 | 100 | 92 | 2168 | 0 | 241 | sim |
| perfil | mobile | 100 | 96 | 100 | 92 | 1492 | 0 | 30 | sim |
| home | desktop | 100 | 97 | 100 | 92 | 510 | 0.0021 | 0 | sim |
| detalhe | desktop | 100 | 97 | 100 | 92 | 673 | 0 | 2 | sim |
| perfil | desktop | 100 | 96 | 100 | 92 | 456 | 0 | 0 | sim |

Relatórios HTML/JSON da execução mais próxima da mediana: `lighthouse/<página>-<perfil>.html|json`. Todas as execuções estão em `summary.json`.
