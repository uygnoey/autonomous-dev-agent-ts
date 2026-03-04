# autonomous-dev-agent (adev)

> **Languages:** [English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [Español](README.es.md)

**Sistema de agente de desarrollo autónomo impulsado por Claude Code Skills + RAG**

[![TypeScript](https://img.shields.io/badge/TypeScript-ESNext-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.1-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)
[![Claude SDK](https://img.shields.io/badge/Claude_Agent_SDK-V2_Session_API-cc785c?logo=anthropic&logoColor=white)](https://docs.anthropic.com/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Embedded_Vector_DB-4B8BBE)](https://lancedb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 1. Descripción del Proyecto

**adev (autonomous-dev-agent)** es un sistema inteligente de orquestación de agentes que combina las capacidades avanzadas de Claude con RAG (Generación Aumentada por Recuperación) para ofrecer desarrollo de software autónomo consistente y de alta calidad.

Construido sobre el Claude Agent SDK con una arquitectura de tres capas, gestiona todo el ciclo de vida del desarrollo desde la recopilación de requisitos hasta el código listo para producción con siete agentes especializados trabajando en fases coordinadas.

### Características Principales

- **Arquitectura de 3 Capas**: Separación clara entre diálogo de usuario (Layer1), desarrollo autónomo (Layer2) y generación de artefactos (Layer3)
- **7 Agentes Especializados**: architect, qa, coder, tester, qc, reviewer y documenter trabajando en fases coordinadas
- **Máquina de Estados de 4 Fases**: Flujo de trabajo DESIGN → CODE → TEST → VERIFY con transiciones basadas en FSM
- **Validación de 4 Capas**: qa/qc → reviewer → Layer1 (validación de intención) → adev (juicio final)
- **Pruebas Fail-Fast**: Detener inmediatamente ante el primer fallo → corregir → re-ejecutar desde ese paso
- **Memoria Mejorada con RAG**: Base de datos vectorial LanceDB para contexto persistente, decisiones de diseño e historial de fallos
- **Nivel de Embedding de 4 Proveedores**: Selección automática gratuita (Xenova/Jina) + paga (Voyage)
- **Servidores MCP Integrados**: filesystem, lancedb, memory, web-search con soporte MCP personalizado
- **Documentación Multilingüe**: Generación automática en inglés, coreano, japonés y español

---

## 2. Descripción de la Arquitectura

### Estructura de 3 Capas

```
┌───────────────────────────────────────────────┐
│ Layer 1: Claude API (Opus 4.6)               │
│ Diálogo de usuario, planificación, diseño,   │
│ validación. Módulos: src/layer1/              │
├───────────────────────────────────────────────┤
│       Usuario "Confirmar" → Contract → Layer2 │
├───────────────────────────────────────────────┤
│ Layer 2: Claude Agent SDK (V2 Session API)   │
│ ┌─────────────────────────────────────────┐   │
│ │ Layer2-A: Desarrollo de Funcionalidades │   │
│ │   adev (Líder del Equipo)               │   │
│ │   ├─ architect  — Diseño y arquitectura│   │
│ │   ├─ qa         — Puerta de prevención │   │
│ │   ├─ coder ×N   — Implementación código│   │
│ │   ├─ tester     — Pruebas + Fail-fast  │   │
│ │   ├─ qc         — Detección y ACR      │   │
│ │   ├─ reviewer   — Revisión de código   │   │
│ │   └─ documenter — Documentación        │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-B: Verificación de Integración   │   │
│ │   Pruebas E2E Fail-Fast en cascada     │   │
│ ├─────────────────────────────────────────┤   │
│ │ Layer2-C: Confirmación de Usuario       │   │
│ └─────────────────────────────────────────┘   │
├───────────────────────────────────────────────┤
│ Layer 3: Artefactos + Verificación Continua  │
│ Docs integrados, salidas de negocio, E2E      │
│ Módulos: src/layer3/                          │
└───────────────────────────────────────────────┘
```

### Gráfico de Dependencias de Módulos

```
┌─────┐
│ cli │ ─────→ core, auth, layer1
└──┬──┘
   ↓
┌────────┐
│ layer1 │ ─→ core, rag
└────┬───┘
     ↓
┌────────┐
│ layer2 │ ─→ core, rag, layer1
└────┬───┘
     ↓
┌────────┐
│ layer3 │ ─→ core, rag, layer2
└────────┘

┌─────┐     ┌──────┐     ┌─────┐
│ rag │ ─→  │ core │  ←─ │ mcp │
└─────┘     └──────┘     └─────┘
            ↑
┌──────┐    │
│ auth │ ───┘
└──────┘
```

**Regla**: Las dependencias fluyen solo en la dirección de la flecha. No se permiten dependencias circulares. El módulo `core` no importa nada.

### Módulos Clave

| Módulo | Archivos | Responsabilidad Principal |
|--------|-------|---------------------|
| `core/` | 5 | config, errors, logger, memory, plugin-loader |
| `auth/` | 4 | Autenticación de clave API / Suscripción |
| `cli/` | 5 | Comandos CLI (init, start, config, project) |
| `layer1/` | 8 | Diálogo de usuario, planificación, diseño, creación de contratos |
| `layer2/` | 16 | Orquestación de desarrollo autónomo |
| `layer3/` | 5 | Docs integrados, E2E continuo, artefactos de negocio |
| `rag/` | 7 | LanceDB, embeddings, indexación de código, búsqueda |
| `mcp/` | 12 | Gestión de servidor MCP, 4 servidores integrados |

---

## 3. Instalación

### Requisitos Previos

- **Runtime Bun** (≥1.1.0) - Runtime JavaScript/TypeScript rápido
- **Clave API de Anthropic** O **Suscripción Claude Pro/Max**

### Instalar Bun

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (WSL)
curl -fsSL https://bun.sh/install | bash

# Verificar instalación
bun --version
```

### Clonar y Configurar

```bash
# Clonar repositorio
git clone https://github.com/yourusername/autonomous-dev-agent.git
cd autonomous-dev-agent

# Instalar dependencias
bun install
```

### Autenticación

Elija UN método de autenticación:

#### Método 1: Clave API

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

#### Método 2: Suscripción (Pro/Max)

```bash
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

> **Nota**: Solo configure UNA variable de entorno. No configure ambas simultáneamente.

---

## 4. Uso

### Sesión de Desarrollo Interactiva

Iniciar una sesión de desarrollo interactiva:

```bash
# Modo de desarrollo
bun run dev

# Binario compilado (después de compilar)
./dist/index.js
```

En modo interactivo, puede:
- Discutir requisitos e ideas del proyecto
- Generar documentos de diseño y contratos
- Activar desarrollo autónomo con 7 agentes
- Revisar y validar salidas en cada fase
- Realizar mejoras iterativas basadas en retroalimentación

### Comandos CLI

```bash
# Inicializar proyecto + autenticación
adev init

# Iniciar diálogo Layer1
adev start

# Ver/modificar configuración
adev config

# Registrar nuevo proyecto
adev project add <path>

# Listar proyectos registrados
adev project list

# Cambiar proyecto activo
adev project switch <id>
```

### Compilar para Producción

```bash
# Compilar
bun run build

# Ejecutar binario compilado
./dist/index.js
```

---

## 5. Pruebas

### Ejecutar Todas las Pruebas

```bash
# Suite completa de pruebas
bun test

# Con reporte de cobertura
bun test --coverage
```

### Pruebas por Categoría

```bash
# Solo pruebas unitarias
bun run test:unit

# Pruebas de integración de módulos
bun run test:module

# Pruebas de extremo a extremo
bun run test:e2e
```

### Estrategia de Pruebas Fail-Fast

El sistema sigue una filosofía de pruebas **Fail-Fast**:

```
Modo Funcionalidad (Layer2-A):
  Unitarias 10,000 → Módulo 10,000 → E2E 100,000+

Modo Integración (Layer2-B) — En cascada:
  Paso 1: E2E de funcionalidad modificada 100,000+
  Paso 2: E2E de funcionalidades relacionadas 10,000 (regresión)
  Paso 3: E2E de funcionalidades no relacionadas 1,000 (humo)
  Paso 4: E2E de integración completa 1,000,000

Proporción: casos aleatorios/extremos 80%+ · casos normales máx 20%
```

**Principio**: 1 fallo → detención inmediata → corregir → reiniciar desde ese paso. Nunca continuar con pruebas fallidas.

---

## 6. Documentación API

Documentación completa disponible en múltiples idiomas:

- 📘 [English Documentation](docs/api/en/) - Referencia completa de API
- 📗 [한국어 문서](docs/api/ko/) - Referencia completa de API
- 📙 [日本語ドキュメント](docs/api/ja/) - Referencia completa de API
- 📕 [Documentación en Español](docs/api/es/) - Referencia completa de API

### Documentos Técnicos Clave

| Documento | Descripción |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Estructura de 3 capas, dependencias de módulos, patrones V2 Session API |
| [SPEC.md](SPEC.md) | Especificación técnica completa v2.4 |
| [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md) | Guía de implementación fase por fase |
| [AGENT-ROLES.md](docs/references/AGENT-ROLES.md) | Detalles de 7 agentes especializados |
| [PHASE-ENGINE.md](docs/references/PHASE-ENGINE.md) | Reglas de transición FSM de 4 fases |
| [EMBEDDING-STRATEGY.md](docs/references/EMBEDDING-STRATEGY.md) | Estrategia de embedding de nivel 4-Provider |
| [V2-SESSION-API.md](docs/references/V2-SESSION-API.md) | Patrones de runtime de SDK V2 Session API |
| [CONTRACT-SCHEMA.md](docs/references/CONTRACT-SCHEMA.md) | Esquema HandoffPackage basado en contrato |
| [TESTING-STRATEGY.md](docs/references/TESTING-STRATEGY.md) | Verificación de integración Fail-Fast + en cascada |

---

## 7. Contribuir

¡Damos la bienvenida a las contribuciones! Por favor, siga estas pautas:

### Convenciones de Código

- **Solo ES Modules**: No CommonJS (`require`)
- **Modo TypeScript Strict**: No tipos `any`, usar `unknown` + guardias de tipo
- **Patrón Result**: Usar `Result<T, E>` para manejo de errores, minimizar `throw`
- **Convenciones de Nomenclatura**:
  - Variables/Funciones: `camelCase`
  - Tipos/Clases/Interfaces: `PascalCase`
  - Constantes: `UPPER_SNAKE_CASE`
  - Archivos: `kebab-case.ts`
- **Tamaño de Archivo**: Dividir archivos que excedan 300 líneas
- **Registro**: Usar `src/core/logger.ts`, nunca `console.log`
- **Entorno**: Usar `src/core/config.ts`, nunca acceso directo a `process.env`

### Flujo de Trabajo de Desarrollo

1. Bifurcar el repositorio
2. Crear una rama de funcionalidad: `feature/{nombre-funcionalidad}`
3. Realizar cambios siguiendo las convenciones de código
4. Ejecutar comprobaciones de calidad: `bun run check`
5. Commit con Conventional Commits:
   - `feat:` - Nueva funcionalidad
   - `fix:` - Corrección de errores
   - `docs:` - Cambios en documentación
   - `refactor:` - Refactorización de código
   - `test:` - Cambios en pruebas
   - `chore:` - Tareas de mantenimiento
6. Push y abrir un Pull Request

### Puertas de Calidad (Todas Deben Pasar)

- [ ] Comprobación de tipos TypeScript: `bun run typecheck`
- [ ] Linting: `bun run lint`
- [ ] Todas las pruebas pasando: `bun run test`
- [ ] Cobertura de pruebas ≥80%
- [ ] Sin dependencias circulares
- [ ] Documentación actualizada

### Proceso de Pull Request

1. Asegurar que todas las pruebas pasen (`bun test`)
2. Actualizar documentación si es necesario
3. Seguir la plantilla de PR
4. Solicitar revisión de los mantenedores
5. Atender comentarios de revisión
6. Fusionar después de la aprobación

### Informar Problemas

- Usar plantillas de problemas para errores y solicitudes de funcionalidad
- Incluir pasos de reproducción para errores
- Proporcionar contexto para solicitudes de funcionalidad
- Buscar primero en problemas existentes

---

## 8. Licencia

Este proyecto está licenciado bajo la **Licencia MIT** - ver el archivo [LICENSE](LICENSE) para más detalles.

---

## Recursos Adicionales

### Pila Tecnológica

| Categoría | Tecnología | Propósito |
|----------|-----------|---------|
| **Runtime** | [Bun](https://bun.sh/) ≥1.1 | Gestor de paquetes, bundler, ejecutor de pruebas |
| **Lenguaje** | TypeScript (ESNext, strict) | Toda la base de código |
| **Agent SDK** | [@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code) | Ejecución de agentes basada en V2 Session API |
| **Vector DB** | [LanceDB](https://lancedb.com/) | DB vectorial embebida, sin servidor, basada en archivos |
| **Embedding** | [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | Embeddings locales (Xenova/Jina) |
| **Linter** | [Biome](https://biomejs.dev/) | Linting + formateo |

### Motor de 4 Fases

Los agentes progresan a través de cada fase para completar funcionalidades:

```
DESIGN ──(puerta qa + consenso)───→ CODE
CODE   ──(implementación completa)→ TEST
TEST   ──(0 fallos + qc)──────────→ VERIFY
VERIFY ──(validación de 4 capas)──→ Completo
VERIFY ──(fallo)──────────────────→ Volver a DESIGN/CODE/TEST
```

| Fase | Ejecución | Agente Líder | Notas |
|-------|-----------|------------|-------|
| **DESIGN** | Equipos de Agentes (discusión) | architect | Puerta qa obligatoria |
| **CODE** | query() ×N paralelo | coder ×N | Ramas Git por módulo |
| **TEST** | query() secuencial | tester | Fail-Fast (detener en 1er fallo) |
| **VERIFY** | query() secuencial | adev | Validación de 4 capas |

### 7 Agentes Especializados

| Agente | Tipo | Rol | Modificación de Código |
|-------|------|------|-------------------|
| **architect** | Loop | Diseño técnico, decisiones de arquitectura | ✗ |
| **qa** | Loop | Puerta de prevención — validar specs/diseño antes de codificar | ✗ |
| **coder** | Loop | Implementación de código (único agente con acceso de escritura) | ✓ |
| **tester** | Loop | Generación de pruebas + ejecución Fail-Fast | Solo pruebas |
| **qc** | Loop | Detección — análisis de causa raíz (identificar 1 causa) | ✗ |
| **reviewer** | Loop | Revisión de código, juicio de convención/calidad | ✗ |
| **documenter** | Event | Generado al completar fase → generar docs → salir | ✗ |

> **qa** es **prevención** (antes de codificar), **qc** es **detección** (después de codificar). Los roles están claramente separados.
> **coder** puede ejecutarse ×N en paralelo, trabajando en ramas Git `feature/{name}-{module}-coderN` por módulo.

### Tablas LanceDB

| Tabla | Propósito |
|-------|---------|
| `memory` | Historial de conversaciones, decisiones, retroalimentación, errores |
| `code_index` | Índice vectorial de fragmentos de código base |
| `design_decisions` | Historial de decisiones de diseño |
| `failures` | Historial de fallos + soluciones |

### Nivel de Embedding de 4 Proveedores

```
¿Existe VOYAGE_API_KEY?
  ├─ SÍ → Código: voyage-code-3, Texto: voyage-4-lite  (Nivel 2, Pago)
  └─ NO → Código: jina-v3,       Texto: xenova-minilm  (Nivel 1, Gratis)
```

### Scripts de Desarrollo

| Comando | Descripción |
|---------|-------------|
| `bun run dev` | Ejecutar en modo de desarrollo |
| `bun run build` | Compilar para producción |
| `bun run test` | Ejecutar todas las pruebas |
| `bun run test:unit` | Solo pruebas unitarias |
| `bun run test:module` | Pruebas de integración de módulos |
| `bun run test:e2e` | Pruebas E2E |
| `bun run typecheck` | Comprobación de tipos TypeScript |
| `bun run lint` | Linting con Biome |
| `bun run format` | Formateo automático con Biome |
| `bun run check` | typecheck + lint + test |

---

## Ejemplo de Flujo de Trabajo

```
Usuario                       adev (Layer1)                  Agentes (Layer2)
 │                               │                               │
 │── "Quiero crear REST API" ──→│                               │
 │                               │── Ideas + preguntas ──→       │
 │←── Retroalimentación/revisiones│                               │
 │                               │   (bucle infinito)            │
 │── "Confirmar" ──────────────→ │                               │
 │                               │── Creación de contrato ──→    │
 │←── Revisión de contrato ──    │                               │
 │── "Aceptar" ─────────────────→│                               │
 │                               │── HandoffPackage ─────────→   │
 │                               │                               │── DESIGN (discusión de equipo)
 │                               │                               │── CODE (coder ×N paralelo)
 │                               │                               │── TEST (Fail-Fast)
 │                               │                               │── VERIFY (validación de 4 capas)
 │                               │←── Resultados de validación ──│
 │←── Informe de resultados ──   │                               │
 │                               │                               │
 │── "Confirmar" ──────────────→ │── Transición Layer3 ──→       │
 │                               │   Docs integrados + E2E continuo│
```

---

## Soporte

- 📧 Email: support@adev.example.com
- 💬 Discord: [Únete a nuestra comunidad](https://discord.gg/adev)
- 🐛 Problemas: [GitHub Issues](https://github.com/yourusername/autonomous-dev-agent/issues)
- 📖 Docs: [Documentación Completa](https://docs.adev.example.com)

---

## Agradecimientos

- **Anthropic** - Claude API y Agent SDK
- **LanceDB** - Base de datos vectorial embebida
- **Bun** - Runtime JavaScript rápido
- **Contribuidores de la comunidad** - ¡Gracias por sus contribuciones!

---

**Construido con cuidado por el equipo de adev**
