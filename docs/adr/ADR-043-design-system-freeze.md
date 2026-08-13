# ADR-043 — Design System Freeze (v1)

## Título

Design System Freeze — primeira versão estabilizada

## Status

ACEITA

## Data

2026-08-13

## Contexto

O frontend do Dashboard Economização avançou, na fase 1.1F, da fundação visual até um conjunto reutilizável de primitives prontas para as telas de produto.

A evolução ocorreu nesta ordem:

1. **Theme System** — camadas Design System → Theme → Tenant Branding (ADR-042 / `docs/12-design-system.md`).
2. **Design Tokens** — tokens semânticos de cor, spacing, radius, elevation, duration, opacity e z-index.
3. **Light Theme** e **Dark Theme** — conjuntos próprios (não inversão mecânica), com Economização como theme default da plataforma.
4. **Theme Provider** e **Resolver** — `ThemeProvider`, `resolveTheme()` e aplicação de CSS Variables no runtime.
5. **Componentes Base** — Typography, Button, Input, PasswordInput, FormField, Card, Divider, Badge, Spinner, IconButton, Stack, Container.
6. **Playground** — rota interna `/__dev/ui`, disponível apenas em desenvolvimento, para revisão Light/Dark.
7. **Revisões visuais humanas** — validação de arquitetura, tokens, responsividade, tipografia e consistência estrutural.
8. **Rodadas de UI Polish** — subfases corretivas 1.1F-B.1 e 1.1F-B.2 (acabamento, profundidade, estados, rhythm).
9. **Visual Freeze Candidate** — última rodada de refinamento antes da estabilização oficial.

Com isso, o Design System atingiu maturidade suficiente para estabilização: identidade default definida, Dark Mode operacional, componentes agnósticos de marca e superfície de revisão verificável.

Sem um freeze explícito, cada novo módulo tenderia a introduzir estilos ad hoc, variantes paralelas e retrabalho visual — minando consistência e velocidade.

## Decisão

O Design System entra oficialmente em estado de **congelamento (Freeze v1)**.

A partir desta ADR:

1. Novos módulos (Login, Dashboard, Relatórios, Empresas, Usuários, Configurações e demais) **reutilizam** os componentes e tokens existentes.
2. Novos componentes, quando necessários, **seguem a arquitetura existente** (`frontend/src/components/ui/`, tokens semânticos, CSS Variables, Light/Dark sem `if (darkMode)`).
3. **Não** serão feitas alterações estéticas por preferência pessoal.
4. Mudanças visuais serão aceitas **somente** quando:
   - corrigirem bugs;
   - melhorarem acessibilidade;
   - adicionarem componentes inexistentes com uso real;
   - resolverem inconsistências reais entre tokens/componentes/docs;
   - aumentarem performance sem degradar a qualidade visual.

O Freeze v1 não impede evolução controlada; impede deriva estética sem justificativa técnica.

## Escopo congelado

Fazem parte do Freeze v1:

| Área | Itens |
|------|--------|
| Fundação | Tokens; Light Theme; Dark Theme; Theme Provider; Theme Resolver; CSS Variables |
| Tipografia | Typography (`display`, `heading`, `title`, `body`, `label`, `caption`, `numeric`) |
| Ação | Buttons; IconButton |
| Formulário | Input; PasswordInput; FormField |
| Estrutura / feedback | Cards; Divider; Badge; Spinner; Stack; Container |
| Revisão | Playground `/__dev/ui` (somente desenvolvimento) |

Fora do Freeze v1 (podem nascer sob demanda, alinhados a esta ADR): Select, Checkbox, Modal, Drawer, Toast, Table, Skeleton, EmptyState, ErrorState e demais primitives ainda sem uso real.

## Branding

1. **Economização é apenas o Theme Default** da plataforma (login/fallback e identidade padrão).
2. O **Branding Runtime** (futuro) continuará permitindo personalização por tenant via overrides validados, sem recompilação por cliente.
3. **Nenhum componente possui identidade fixa da Economização** — consomem apenas tokens semânticos (`primary`, `accent`, `surface`, `success`, `danger`, etc.).
4. Tokens semânticos críticos (`success`, `warning`, `danger`, `info` e correlatos protegidos) não têm seu significado alterado por branding de tenant.

Esta decisão reforça ADR-042 e o contrato de `docs/12-design-system.md`.

## Compatibilidade

Esta ADR é compatível e complementar a:

| Referência | Relação |
|------------|---------|
| [ADR-041](./ADR-041-stack-oficial.md) | Stack oficial; Design System/componentes como base da UI |
| [ADR-042](./ADR-042-theming-dark-mode-branding.md) | Theming, Dark Mode e Branding por tenant |
| [`docs/12-design-system.md`](../12-design-system.md) | Contrato normativo de tokens e camadas visuais |
| [`docs/09.23-convencoes-ui.md`](../09.23-convencoes-ui.md) | Convenções de UI, tema resolvido e composição |
| [`docs/10-plano-de-execucao.md`](../10-plano-de-execucao.md) | Plano de execução; Freeze como base para 1.1F-C+ e módulos seguintes |

Em caso de conflito pontual de detalhe visual entre implementação e documentação de produto, prevalece o contrato de `docs/12-design-system.md` e as ADRs 042/043, com atualização documental controlada quando necessário.

## Consequências

### Positivas

- consistência visual entre todos os módulos futuros;
- velocidade de desenvolvimento (reuso em vez de reinventar UI);
- menor retrabalho e menor dívida técnica estética;
- onboarding mais simples para novos módulos e contribuidores;
- base estável para Login, Dashboard e demais telas sem redesenho paralelo.

### Negativas / custos

- mudanças estéticas exigem justificativa técnica explícita;
- pedidos de “ajuste visual por preferência” devem ser rejeitados ou convertidos em requisito (a11y, bug, componente novo, inconsistência, performance).

### Neutras

- Branding Runtime, editor de branding e preferência persistida Light/Dark/System do usuário permanecem fora do escopo desta ADR;
- a tela de Login e demais telas de produto não são criadas por esta ADR — apenas passam a depender do Freeze v1.

## Regras

- não criar bibliotecas de componentes paralelas ao Design System Freeze v1;
- não hardcodar cores de marca (Economização ou tenant) em componentes;
- não duplicar variantes Light/Dark por componente;
- playground permanece ferramenta de desenvolvimento, não superfície de produto;
- evolução do Freeze (v1.1+) requer ADR ou atualização explícita desta decisão quando o impacto for estrutural.

## Referências

- `docs/adr/ADR-041-stack-oficial.md`
- `docs/adr/ADR-042-theming-dark-mode-branding.md`
- `docs/12-design-system.md`
- `docs/09.23-convencoes-ui.md`
- `docs/09.4-frontend.md`
- `docs/05-ui-ux.md`
- `docs/10-plano-de-execucao.md`
- `docs/11-stack-oficial.md`
