'use client';

import { useState, type ReactNode } from 'react';

import {
  Badge,
  Button,
  Card,
  Container,
  Divider,
  FormField,
  IconButton,
  Input,
  PasswordInput,
  Spinner,
  Stack,
  Typography,
} from '../components/ui';
import { IconCircleCheckBig } from '../components/ui/icons';
import { ThemeProvider } from '../theme';
import type { ResolvedColorScheme } from '../theme/types/theme';
import { DevBrandingPreview } from './dev-branding-preview';
import styles from './dev-ui-playground.module.css';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.section}>
      <Typography as="h2" variant="title">
        {title}
      </Typography>
      <Divider />
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function DemoGlyph() {
  return <IconCircleCheckBig size={14} />;
}

export function DevUiPlayground() {
  const [scheme, setScheme] = useState<ResolvedColorScheme>('light');

  return (
    <ThemeProvider preference={scheme}>
      <div className={styles.page}>
        <Container size="xl">
          <Stack gap={10}>
            <header className={styles.header}>
              <Stack gap={3}>
                <Badge variant="neutral" className={styles.devBadge}>
                  DEV
                </Badge>
                <Typography as="h1" variant="heading">
                  UI Playground
                </Typography>
                <Typography variant="body">
                  Design System Freeze v1 + Theme Engine / Branding Runtime (mock). Sem login, sem
                  backend, sem dashboard.
                </Typography>
              </Stack>
              <Stack direction="horizontal" gap={2} wrap>
                <Button
                  variant={scheme === 'light' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setScheme('light')}
                  aria-pressed={scheme === 'light'}
                >
                  Light
                </Button>
                <Button
                  variant={scheme === 'dark' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setScheme('dark')}
                  aria-pressed={scheme === 'dark'}
                >
                  Dark
                </Button>
              </Stack>
            </header>

            <Section title="Branding Preview">
              <DevBrandingPreview colorScheme={scheme} />
            </Section>

            <Section title="Typography">
              <Stack gap={4}>
                <Typography variant="display">Display</Typography>
                <Typography variant="heading">Heading</Typography>
                <Typography variant="title">Title</Typography>
                <Typography variant="body">Body — texto de apoio e conteúdo.</Typography>
                <Typography variant="label">Label</Typography>
                <Typography variant="caption">Caption</Typography>
                <Typography variant="numeric">R$ 12.345,67</Typography>
                <Typography variant="numeric" className={styles.accentNumeric}>
                  R$ 12.345,67 · accent
                </Typography>
              </Stack>
            </Section>

            <Section title="Buttons">
              <Stack gap={4}>
                <Stack direction="horizontal" gap={3} wrap>
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </Stack>
                <Stack direction="horizontal" gap={3} wrap>
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </Stack>
                <Stack direction="horizontal" gap={3} wrap>
                  <Button disabled>Disabled</Button>
                  <Button loading>Loading</Button>
                  <Button leftIcon={<DemoGlyph />}>Com ícone</Button>
                </Stack>
              </Stack>
            </Section>

            <Section title="Inputs">
              <Stack gap={4} style={{ maxWidth: '24rem' }}>
                <Input placeholder="Default" defaultValue="" />
                <Input placeholder="Disabled" disabled />
                <Input placeholder="Error" invalid defaultValue="valor inválido" />
              </Stack>
            </Section>

            <Section title="PasswordInput">
              <Stack gap={4} style={{ maxWidth: '24rem' }}>
                <PasswordInput
                  name="demo-password"
                  placeholder="Senha"
                  autoComplete="new-password"
                />
                <PasswordInput
                  name="demo-password-error"
                  placeholder="Senha com erro"
                  invalid
                  defaultValue="secret"
                />
              </Stack>
            </Section>

            <Section title="FormField">
              <Stack gap={4} style={{ maxWidth: '24rem' }}>
                <FormField label="E-mail" hint="Use o e-mail corporativo.">
                  <Input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="voce@empresa.com"
                  />
                </FormField>
                <FormField label="Senha" error="Senha obrigatória." required>
                  <PasswordInput name="password" autoComplete="current-password" />
                </FormField>
              </Stack>
            </Section>

            <Section title="Cards">
              <Stack direction="horizontal" gap={4} wrap>
                <Card style={{ minWidth: '16rem', flex: 1 }}>
                  <Typography variant="title">Default</Typography>
                  <Typography variant="body">Surface com borda, sem sombra obrigatória.</Typography>
                </Card>
                <Card variant="elevated" style={{ minWidth: '16rem', flex: 1 }}>
                  <Typography variant="title">Elevated</Typography>
                  <Typography variant="body">Surface elevada com token de elevation.</Typography>
                </Card>
              </Stack>
            </Section>

            <Section title="Badges">
              <Stack direction="horizontal" gap={2} wrap>
                <Badge variant="neutral">Neutral</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="info">Info</Badge>
              </Stack>
            </Section>

            <Section title="Spinner">
              <Stack direction="horizontal" gap={4} align="center">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </Stack>
            </Section>

            <Section title="IconButton">
              <Stack direction="horizontal" gap={3} align="center">
                <IconButton aria-label="Ação ghost" variant="ghost">
                  <DemoGlyph />
                </IconButton>
                <IconButton aria-label="Ação secondary" variant="secondary">
                  <DemoGlyph />
                </IconButton>
                <IconButton aria-label="Ação primary" variant="primary">
                  <DemoGlyph />
                </IconButton>
                <IconButton aria-label="Ação danger" variant="ghost" tone="danger">
                  <DemoGlyph />
                </IconButton>
                <IconButton aria-label="Desabilitado" disabled>
                  <DemoGlyph />
                </IconButton>
                <IconButton aria-label="Carregando" loading>
                  <DemoGlyph />
                </IconButton>
              </Stack>
            </Section>

            <Section title="Spacing / Layout">
              <Card>
                <Stack gap={4}>
                  <Typography variant="body">Stack vertical com gap token.</Typography>
                  <Stack direction="horizontal" gap={3}>
                    <Badge>1</Badge>
                    <Badge>2</Badge>
                    <Badge>3</Badge>
                  </Stack>
                  <Divider />
                  <Typography variant="caption">
                    Container responsivo + Divider com token divider.
                  </Typography>
                </Stack>
              </Card>
            </Section>
          </Stack>
        </Container>
      </div>
    </ThemeProvider>
  );
}
