# Dashboard Economização

# 12 — Design System e Theming

**Status:** Ativo  
**Projeto:** Dashboard Economização  
**Tipo:** Contrato Visual Oficial  
**Documento normativo:** `docs/12-design-system.md`  
**ADR vinculada:** `docs/adr/ADR-042-theming-dark-mode-branding.md`  
**Documentos de leitura conjunta:** `docs/01-prd.md` (BRAND), `docs/05-ui-ux.md`, `docs/09.4-frontend.md`, `docs/09.8-seguranca.md`, `docs/09.9-multiempresa.md`, `docs/09.23-convencoes-ui.md`, `docs/11-stack-oficial.md`

---

## 1. Objetivo

Este documento é o contrato visual oficial do Dashboard Economização.

Ele define como a interface deverá ser construída para sustentar, sem reescrever componentes:

- modo claro (Light);
- modo escuro (Dark) — requisito oficial da plataforma;
- branding por empresa (tenant);
- branding padrão da plataforma como fallback;
- consistência visual, acessibilidade e responsividade;
- evolução futura de identidade sem acoplamento a uma marca específica.

O Design System **não** é acoplado às cores atuais da marca Economização. A logo e a identidade atuais da Economização servem apenas como referência inicial do **tema padrão da plataforma** e como fallback visual.

A escolha de biblioteca de UI, biblioteca de gráficos e estratégia concreta de estilização permanece sujeita a `docs/08-decisoes-tecnicas.md` e `docs/11-stack-oficial.md`. Este documento fixa o contrato visual e as regras de theming, independentemente da biblioteca futura.

---

## 2. Filosofia visual

A interface deverá transmitir:

- confiança;
- clareza;
- modernidade;
- tecnologia;
- sofisticação;
- simplicidade;
- precisão financeira.

Deverá priorizar:

- legibilidade;
- hierarquia;
- espaço (respiro);
- dados;
- velocidade de compreensão.

Deverá evitar:

- estética de ERP antigo;
- interface excessivamente carregada;
- excesso de gradientes;
- excesso de efeitos e animações ornamentais;
- excesso de cores competindo pela atenção;
- elementos financeiros clichês (cifrões decorativos, “dinheiro voando”, metáforas infantis);
- UI infantilizada;
- dependência visual de uma única marca embutida nos componentes.

Conforme `docs/05-ui-ux.md`: a interface não deverá parecer um sistema contábil antigo; o usuário não deverá precisar ser especialista em finanças para compreender o que está sendo mostrado.

---

## 3. Camadas do sistema visual

A arquitetura visual oficial possui três níveis:

### 3.1 Nível 1 — Design System

Responsável por estrutura e comportamento estáveis:

- spacing;
- radius;
- grid e layout;
- tipografia (categorias e escalas);
- componentes;
- animações e motion;
- sombras e elevação;
- acessibilidade;
- comportamento responsivo;
- padrões de formulário, tabela, empty/error/loading.

Este nível **não conhece marcas específicas** e não embute cores de Economização, de Felipe ou de clientes.

### 3.2 Nível 2 — Theme

Responsável por **tokens semânticos** do tema resolvido (Light ou Dark):

| Token semântico | Função |
|---|---|
| `background` | Fundo da aplicação |
| `surface` | Superfície padrão (painéis, cards base) |
| `surfaceElevated` | Superfície elevada (modais, drawers, overlays) |
| `primary` | Ação e identidade principal |
| `secondary` | Apoio visual secundário |
| `accent` | Destaque pontual controlado |
| `textPrimary` | Texto principal |
| `textSecondary` | Texto secundário |
| `textMuted` | Texto auxiliar / metadados |
| `border` | Bordas e divisores |
| `success` | Estado de sucesso |
| `warning` | Estado de aviso |
| `danger` | Estado de erro / risco |
| `info` | Estado informativo |
| `focus` | Anel / indicação de foco |
| `disabled` | Elementos desabilitados |

Tokens adicionais de gráfico, overlay, skeleton e scrollbar poderão ser introduzidos desde que permaneçam semânticos.

### 3.3 Nível 3 — Tenant Branding

Responsável por personalizações controladas de cada empresa:

- logo;
- `primary`, `secondary`, `accent`;
- cores complementares **permitidas** pela política;
- conjuntos Light e Dark do tenant;
- demais tokens autorizados pelo contrato de branding.

O tenant **não** altera estrutura de componentes, grid, tipografia base, regras de acessibilidade nem autorização.

Fluxo oficial (alinhado a `docs/05-ui-ux.md` §85 e `docs/09.23` §3.9):

```
Design System
    +
Theme (Light | Dark | System → resolvido)
    +
Tenant Branding (overrides validados)
        ↓
Resolved Theme
        ↓
Componentes
```

---

## 4. Regra central de tokens

Componentes **nunca** deverão utilizar cores de marca diretamente.

Proibido conceitualmente:

```text
background: #1F2C6D
```

Preferir:

```text
background: var(--color-primary)
```

ou mecanismo equivalente aprovado na implementação (CSS variables, theme object tipado, etc.), desde que o consumo continue semântico.

Proibido nomear tokens por marca ou pessoa:

- `economizacao-blue`
- `felipe-yellow`
- `client-green`

Usar apenas nomes semânticos (`primary`, `accent`, `danger`, …).

Cores de tenant nunca poderão ser aplicadas manualmente em componentes individuais (`docs/09.23` §3.9).

---

## 5. Light mode

O modo claro possui conjunto próprio de tokens semânticos.

A paleta definitiva por tenant **não** é fixada neste documento.

O **tema padrão da plataforma** poderá se inspirar na identidade Economização:

- azul profundo como `primary`;
- amarelo como `accent` (uso moderado);
- branco / cinzas claros como `background` e `surface`.

Essa inspiração existe apenas como defaults configuráveis do tema da plataforma — nunca como hardcode em componentes.

O `accent` amarelo (quando presente no default) **não** poderá comprometer contraste de texto; texto sobre accent deverá cumprir contraste adequado ou o accent deverá ser limitado a superfícies não textuais (bordas, indicadores, ícones com contraste suficiente).

---

## 6. Dark mode

O modo escuro é **requisito oficial** da plataforma (ADR-042).

Não é aceitável implementar Dark Mode como simples inversão de cores do Light Mode.

Dark Mode deverá possuir tokens próprios para, no mínimo:

- `background`, `surface`, `surfaceElevated`;
- `border`;
- textos (`textPrimary`, `textSecondary`, `textMuted`);
- `primary`, `secondary`, `accent`;
- estados (`success`, `warning`, `danger`, `info`, `focus`, `disabled`);
- tokens de gráfico correspondentes.

Regras:

- preservar contraste e hierarquia equivalentes ao Light Mode;
- evitar preto absoluto (`#000`) como fundo geral;
- evitar branco absoluto (`#FFF`) em grandes blocos de texto;
- não escurecer mecanicamente cada cor do Light;
- componentes **não** deverão conter condicionais espalhadas do tipo `if (darkMode) { ... }` para cores; o comportamento deriva dos tokens do tema resolvido.

Esta decisão eleva o Dark Mode de item pendente de design visual (`docs/05` §94 / `docs/09.23` §5) a requisito oficial de produto, mantendo a obrigação já existente de que o tema resolvido permita Dark Mode **sem reescrita de componentes**.

---

## 7. Branding por tenant

Conforme PRD BRAND-001 e `docs/05-ui-ux.md`:

Cada tenant poderá, via painel administrativo futuro, definir valores controlados tais como:

- logo;
- `primary`, `secondary`, `accent`;
- `background`, `surface`, textos;
- demais tokens autorizados;
- variantes Light e Dark próprias.

Proibições absolutas de customização:

- CSS arbitrário enviado pelo tenant;
- stylesheet remoto controlado pelo tenant;
- JavaScript do tenant;
- HTML livre / rich content não sanitizado como estilo;
- temas compilados separados por cliente;
- duplicação de componentes por tenant.

A customização ocorre **exclusivamente** por valores controlados e validados (`docs/09.8-seguranca.md` §3.12).

Login utiliza branding da **plataforma**; branding do tenant é aplicado **após autenticação** (UX-001, UX-002).

---

## 8. Fallback de branding

Ordem oficial de resolução:

1. branding específico do tenant (quando autenticado e configurado);
2. branding padrão da plataforma;
3. fallback seguro do Design System (tokens mínimos legíveis).

Regras:

- a logo padrão da plataforma é a logo Economização enquanto não houver outra decisão;
- se o tenant não possuir logo, usar a logo Economização;
- ausência de logo ou de cor específica **não** quebra layout (PRD BRAND-002 / BRAND-003);
- **nunca** usar branding de outro tenant como fallback (`docs/09.9-multiempresa.md`);
- a interface nunca poderá ficar sem estilo (`docs/09.23` §3.9).

---

## 9. Light / Dark por tenant

O sistema deverá permitir, sem recompilação:

| Tenant | Light | Dark |
|---|---|---|
| Tenant A | próprio | próprio |
| Tenant B | próprio | próprio |
| Sem config | plataforma | plataforma |

O branding deverá ser carregável em **runtime** a partir de configuração persistida e validada.

---

## 10. Preferência de tema

A arquitetura visual deverá preparar suporte a:

- Light;
- Dark;
- System (seguir preferência do ambiente).

Preferência poderá existir futuramente:

- por usuário;
- por dispositivo / browser;
- por padrão do tenant.

A regra final de persistência e precedência será definida na implementação correspondente. Esta documentação **não** implementa a preferência.

---

## 11. Tipografia

Princípios:

- legibilidade antes de personalidade;
- interface financeira exige números claros;
- pesos suficientes para hierarquia;
- `font-variant-numeric: tabular-nums` (ou equivalente) quando necessário em tabelas e KPIs;
- hierarquia previsível entre telas.

A tipografia definitiva (família) permanece sujeita a aprovação futura; até lá, usar categorias semânticas:

| Categoria | Uso |
|---|---|
| `display` | Destaques raros (marketing interno mínimo) |
| `heading` | Títulos de página / seções maiores |
| `title` | Títulos de card / bloco |
| `body` | Texto corrido |
| `label` | Rótulos de formulário e UI |
| `caption` | Metadados, ajuda, timestamps |
| `numeric` | Valores financeiros e séries |

---

## 12. Spacing

Adotar escala consistente, preferencialmente múltiplos de 4.

Não espalhar valores arbitrários (`13px`, `27px`, etc.) fora de tokens.

Tokens conceituais (nomenclatura equivalente é aceitável):

`space-1`, `space-2`, `space-3`, `space-4`, `space-5`, `space-6`, `space-8`, `space-10`, `space-12`, …

---

## 13. Border radius

Escala controlada:

| Token | Uso típico |
|---|---|
| `radius-sm` | chips, badges pequenos |
| `radius-md` | inputs, botões |
| `radius-lg` | cards |
| `radius-xl` | painéis / superfícies amplas |
| `radius-full` | avatares / elementos circulares |

Componentes não escolhem radius aleatório.

---

## 14. Sombras e elevação

Sombras devem ser discretas.

Cards **não** dependem obrigatoriamente de sombra para existir; border e contraste de `surface` são preferíveis.

No Dark Mode, elevação favorece:

- contraste entre `background` / `surface` / `surfaceElevated`;
- bordas sutis;
- sombra suave apenas quando necessário (modais, popovers).

---

## 15. Animações

Animações devem:

- orientar;
- dar feedback;
- melhorar percepção de continuidade.

Não devem:

- atrasar interação;
- chamar atenção sem necessidade;
- causar movimento excessivo.

Obrigatório respeitar `prefers-reduced-motion` (`docs/09.23`).

---

## 16. Componentes base previstos

O Design System deverá prever (sem implementação nesta tarefa):

Button, Input, PasswordInput, Select, Checkbox, Radio, Switch, Textarea, FormField, Card, Badge, Avatar, Tooltip, Popover, Dropdown, Modal, Drawer, Tabs, Table, Pagination, Toast, Skeleton, EmptyState, ErrorState, Spinner, IconButton, Divider.

Antes de criar componente novo, verificar equivalente existente (`docs/05` §82, `docs/09.23` §4.1).

---

## 17. Estados dos componentes

Todo componente interativo deverá considerar, quando aplicável:

- default;
- hover;
- focus;
- active;
- disabled;
- loading;
- error;
- success.

Estados **não** podem depender somente de cor: texto, ícone, padrão ou rótulo equivalentes são obrigatórios (`docs/09.23`).

---

## 18. Formulários

Contrato mínimo:

- labels visíveis e associados programaticamente;
- mensagens de erro próximas ao campo;
- foco claro (`focus` token);
- navegação por teclado;
- autocomplete adequado;
- compatibilidade com password managers;
- loading no submit;
- prevenção de múltiplos submits.

Alinhado a `docs/09.23` §4.x e à futura tela de autenticação.

---

## 19. Tabelas

Para dados financeiros, tabelas deverão prever:

- alinhamento numérico (direita / tabular nums);
- ordenação;
- filtros;
- paginação;
- loading, vazio e erro;
- responsividade / estratégia de leitura em telas estreitas;
- densidade controlada.

Não criar tabela apenas porque o dado existe: preferir cards/gráficos quando a compreensão for superior (`docs/05`).

---

## 20. Gráficos

Gráficos deverão consumir tokens de tema / tokens gráficos semânticos.

Nunca hardcode de cores de marca ou de tenant nos componentes de gráfico.

A paleta gráfica deverá considerar:

- Light e Dark;
- daltonismo e contraste;
- múltiplas séries distinguíveis sem depender só de cor (traçado, padrão, rótulo);
- estados positivos/negativos via semântica do indicador, não por inferência do sinal isolado (`docs/09.23` §3.x).

Cores financeiras semânticas (`success` / `danger` / `warning` / `info`) **não** devem ser sobrescritas indiscriminadamente pelo branding do tenant.

Gráficos deverão possuir alternativa textual ou tabular da informação essencial (`docs/09.23` §3.10).

---

## 21. Cores semânticas protegidas

Branding **não** controla livremente estados críticos.

Permanecem semânticos do sistema:

- `success`
- `warning`
- `danger`
- `info`

O tenant poderá influenciar o visual dentro de limites seguros validados (contraste, faixa permitida), mas **não** poderá:

- transformar erro em aparência de sucesso;
- transformar sucesso em aparência de erro;
- ou equivalentes que prejudiquem compreensão financeira.

---

## 22. Direção visual do Login (futuro)

Direção inicial para a tela de login (não pixel-perfect):

- limpa, moderna, sofisticada;
- poucos elementos e bastante respiro;
- logo da plataforma em destaque controlado;
- formulário simples;
- sem clichês financeiros;
- responsiva;
- preparada para Light / Dark;
- branding padrão Economização inicialmente (UX-001).

Não deverá parecer um ERP antigo.

Layout detalhado e implementação pertencem à fase correspondente (ex.: 1.1F), não a este documento.

---

## 23. Responsividade

Toda interface deve **nascer** responsiva (`docs/09.23` §3.11):

- desktop;
- notebook;
- tablet;
- mobile.

Funcionalidade essencial não depende de hover, clique direito ou mouse exclusivo. Nenhuma informação essencial é removida no mobile — apenas reorganizada.

---

## 24. Acessibilidade

Obrigatório considerar:

- contraste (incluindo sob branding);
- teclado e foco visível;
- labels associados;
- ARIA quando necessário;
- `prefers-reduced-motion`;
- estados não dependentes somente de cor;
- tamanho adequado de alvo interativo;
- anúncio de mudanças dinâmicas relevantes.

Buscar conformidade compatível com WCAG moderna (meta prática: critérios AA para contraste e operação por teclado nos fluxos essenciais).

---

## 25. Branding administrativo (futuro)

O editor administrativo de branding deverá prever:

- preview Light;
- preview Dark;
- logo;
- `primary`, `secondary`, `accent`;
- `background`, `surface`, textos;
- reset para padrão da plataforma;
- validação de contraste antes de salvar.

Não implementar nesta tarefa.

---

## 26. Segurança do branding

Branding é dado de configuração, não código (`docs/09.8` §3.12, `docs/02` §57):

- não executa código;
- não altera permissões nem autorização;
- não altera DOM arbitrariamente;
- não insere CSS livre;
- não quebra isolamento de tenant;
- não acessa assets de outro tenant;
- valores de cor e URL são validados antes de virarem estilo;
- uploads de logo seguirão política de upload seguro quando implementados (tipo real, tamanho, nome gerado pela aplicação).

Branding **nunca** é mecanismo de autorização.

---

## 27. Cache e carregamento

Branding poderá ser cacheado futuramente.

Regras:

- toda chave de cache respeita `tenantId` (`docs/09.9`, `docs/09.13` quando aplicável);
- fallback existe em falha de carregamento;
- **nunca** mostrar branding de outro tenant como fallback;
- login permanece com identidade da plataforma até autenticação.

---

## 28. Proibições

É proibido:

- cores hardcoded de tenant/marca em componentes;
- estilos inline arbitrários espalhados;
- CSS / JS / HTML customizado enviado por tenant;
- temas compilados separados por cliente;
- duplicação de componentes Light/Dark;
- duplicação de componentes por tenant;
- `if/else` de marca dentro de componentes;
- branding como mecanismo de autorização;
- misturar dados ou assets entre tenants.

---

## 29. Diretriz final

O Design System do Dashboard Economização deverá permitir que:

> a mesma aplicação + os mesmos componentes + o mesmo código  
> assumam identidades visuais diferentes por tenant e por modo de tema  
> apenas através de configuração de tokens.

A identidade visual nunca deverá comprometer:

- segurança;
- legibilidade;
- acessibilidade;
- consistência;
- compreensão dos dados financeiros.

---

## 30. Relação com outros documentos

| Documento | Relação |
|---|---|
| `docs/01-prd.md` | BRAND-001 a BRAND-003 e ADMIN de branding |
| `docs/05-ui-ux.md` | Blueprint de UX; tema centralizado §85; UX-001/002 |
| `docs/09.4-frontend.md` | Aplicação de tema no frontend |
| `docs/09.8-seguranca.md` | Validação de branding / XSS |
| `docs/09.9-multiempresa.md` | Isolamento de tenant e assets |
| `docs/09.23-convencoes-ui.md` | Convenções de componentes, estados e tema |
| `docs/11-stack-oficial.md` | Bibliotecas autorizadas (UI ainda em avaliação) |
| `docs/adr/ADR-042-…` | Decisão arquitetural de theming / dark / branding |

Em conflito entre preferência estética pontual e este contrato, prevalece este documento + ADR-042, sem violar isolamento, segurança ou legibilidade definidos na série 09.
