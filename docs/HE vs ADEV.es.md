# Harness Engineering vs adev — Análisis Comparativo Detallado

> 🌐 **Idioma**: [한국어](HE%20vs%20ADEV.md) | [English](HE%20vs%20ADEV.en.md) | [日本語](HE%20vs%20ADEV.ja.md) | **Español**

> **Fecha**: 2026-03-13
> **Referencia adev**: Especificación v2.4 confirmada + estado de implementación (201 archivos, ~32,681 líneas)
> **Referencia Harness Engineering**: OpenAI (oficialmente acuñado 2026-02), Anthropic Engineering Blog, Martin Fowler, LangChain DeepAgents

---

## Índice

1. [¿Qué es Harness Engineering?](#1-qué-es-harness-engineering)
2. [Arquitectura de adev — Comprensión Precisa](#2-arquitectura-de-adev--comprensión-precisa)
3. [Comparación de la Fórmula Central](#3-comparación-de-la-fórmula-central)
4. [Análisis Comparativo de las 4 Funciones de HE](#4-análisis-comparativo-de-las-4-funciones-de-he)
5. [Comparación de Implementación TDD / CI](#5-comparación-de-implementación-tdd--ci)
6. [Comparación de Orquestación de Agentes](#6-comparación-de-orquestación-de-agentes)
7. [Comparación de Contexto y Memoria](#7-comparación-de-contexto-y-memoria)
8. [Comparación de Continuidad de Sesión](#8-comparación-de-continuidad-de-sesión)
9. [Similitudes](#9-similitudes)
10. [Diferencias — Distinciones Clave](#10-diferencias--distinciones-clave)
11. [Fortalezas de adev](#11-fortalezas-de-adev)
12. [Debilidades de adev / Áreas de Mejora](#12-debilidades-de-adev--áreas-de-mejora)
13. [Matriz de Evaluación Integral](#13-matriz-de-evaluación-integral)

---

## 1. ¿Qué es Harness Engineering?

### Descripción General

**Harness Engineering** es una **disciplina de diseño de entornos** para aprovechar de manera confiable los agentes de IA en tareas del mundo real.

> "El caballo (modelo de IA) es poderoso pero carece de dirección. El arnés canaliza esa fuerza en la dirección correcta."

### Fórmula Central

```
Agente = Modelo + Arnés
```

| Entidad | Rol                                             |
| ------- | ----------------------------------------------- |
| Modelo  | Inteligencia — escribir código, análisis, juicio |
| Arnés   | Dirección — restricciones, contexto, verificación, corrección |

### Contexto de Aparición (2026)

| Fecha   | Evento                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------- |
| 2025    | Año de demostración de capacidades de agentes IA                                                        |
| 2026-02 | **OpenAI**: Generó 1M de líneas de código de producción de forma autónoma con Codex + Arnés; acuñó oficialmente "Harness Engineering" |
| 2026    | Consenso de la industria: **"No es el agente en sí, sino el arnés lo que es difícil"**                  |

### La Causa Real del Fracaso de los Agentes (El Punto de Partida de HE)

No es la falta de capacidad del modelo, sino los **problemas del entorno de orquestación**:

- Pierde dirección después de demasiados pasos
- Repite enfoques fallidos
- El contexto se pierde cuando las sesiones se interrumpen
- No puede rastrear objetivos

> Lección de Vercel: **Reducir las herramientas del agente en un 80% mejoró la tasa de éxito.**

### Las 4 Funciones de Martin Fowler

```
① Constrain  — Limita lo que el agente puede hacer
               (límites arquitectónicos, herramientas permitidas, reglas de estilo)

② Inform     — Le dice al agente qué hacer
               (especificaciones, guías de rol, documentos de arquitectura, Context Engineering)

③ Verify     — Confirma que el agente lo hizo correctamente
               (pruebas automatizadas, comprobaciones de tipo, linters, revisión de código)

④ Correct    — Corrige lo que salió mal
               (bucles de retroalimentación, auto-reparación, registros de progreso entre sesiones)
```

### Arnés de 2 Agentes de Anthropic (Referencia de Implementación Mínima de HE)

```
[Agente Inicializador] — Se ejecuta una vez
  git init / scripts de inicio / lista de funcionalidades / crear claude-progress.txt

[Agente de Codificación] — Se repite en cada sesión
  Leer claude-progress.txt → Identificar posición actual → Implementar 1 funcionalidad
  → Ejecutar pruebas → Hacer commit → Actualizar registro de progreso → Terminar sesión
  → Continuar en la siguiente sesión
```

---

## 2. Arquitectura de adev — Comprensión Precisa

### Qué es adev

```
adev = Sistema de Desarrollo Autónomo con IA
      Automatiza todo el proceso: "Idea → Código de Producción + Documentación + Entregables de Negocio"
```

### ⚠️ Distinción Crítica — bun vs Claude Agent SDK

La distinción más importante para entender adev:

```
┌─────────────────────────────────────────────────────────────────┐
│  bun (runtime de TypeScript)                                     │
│  Rol: Runtime que ejecuta el proceso de adev (arnés) mismo      │
│  Maneja: Ejecución del código del orquestador de adev           │
│  Objetivo: adev mismo (codebase de autonomous-dev-agent-ts)      │
├─────────────────────────────────────────────────────────────────┤
│  Claude Agent SDK V2 (unstable_v2_createSession / prompt)        │
│  Rol: SDK que genera los agentes de desarrollo reales            │
│  Maneja: Escritura de código, generación/ejecución de pruebas,  │
│          documentación para el proyecto objetivo                 │
│  Objetivo: El proyecto que el usuario quiere construir           │
└─────────────────────────────────────────────────────────────────┘
```

Es decir:

- **bun test / bunx tsc / bunx biome** → Gestión de calidad de código de adev mismo (infraestructura de desarrollo de adev)
- **Agentes de Claude Agent SDK** → Escriben código, ejecutan pruebas y realizan CI para el proyecto objetivo

### Arquitectura Completa de 3 Capas

```
┌──────────────────────────────────────────────────────────────────┐
│ Capa 1: Claude API (Opus 4.6) — Interfaz de Conversación         │
│                                                                    │
│  Conversación Usuario ↔ Claude API:                               │
│    Exploración de ideas → Planificación → Diseño → Tech stack     │
│    → Definición de tipos de casos de prueba (no código real)      │
│    → Usuario confirma → Generar Contract (HandoffPackage)         │
│    → Validación estructural y de consistencia → Usuario aprueba   │
│    → Iniciar Capa 2                                               │
│                                                                    │
│  Salidas: Planes, docs de diseño, specs confirmadas, Contract     │
├──────────────────────────────────────────────────────────────────┤
│  adev (proceso TypeScript/Bun) = Líder de Equipo = Arnés          │
│  ↓ Llama a Claude Agent SDK V2                                    │
├──────────────────────────────────────────────────────────────────┤
│ Capa 2: Claude Agent SDK V2 — Desarrollo Autónomo                 │
│         (desarrolla el proyecto objetivo)                         │
│                                                                    │
│  Capa2-A: Bucle de desarrollo por funcionalidad                   │
│    Phase FSM: DESIGN → CODE → TEST → VERIFY                       │
│    7 Agentes (instancias de Claude):                              │
│      architect: Diseño, estructura de módulos (sin codificación)  │
│      qa: Puerta de validación de spec pre-codificación            │
│      coder×N: Escritura de código real (única autoridad de código)│
│      tester: Generación de código de prueba + ejecución Bash      │
│      qc: Análisis de causa raíz en fallos (sin codificación)      │
│      reviewer: Revisión de código (sin codificación)              │
│      documenter: Activado por eventos → genera docs → termina     │
│                                                                    │
│  Capa2-B: Verificación de Integración                             │
│    Fail-Fast en cascada: Step1(E2E 100k) → Step2(10k) → Step3(1k)│
│    → Step4(integración 1M) — repetir hasta 0 bugs                │
│                                                                    │
│  Capa2-C: Punto de Confirmación del Usuario                       │
│    Entregar resultados + informe de pruebas → Aprobación → Capa 3 │
├──────────────────────────────────────────────────────────────────┤
│ Capa 3: Entregables + E2E Continuo                                │
│    8 documentos integrados + 4 entregables de negocio             │
│    E2E continuo cada 5 min → Bug encontrado → Re-ejecutar Capa 2  │
└──────────────────────────────────────────────────────────────────┘
```

### Flujo de Desarrollo Central

```
[Capa 1 — Claude API]
  Genera "Definición de Tipos de Casos de Prueba" para el agente tester:
  → Define 12 categorías, reglas/patrones/valores límite por categoría,
    100-200 casos de muestra, regla de ratio aleatorio 80%+
  → NO escribe código de prueba real (solo especificación)

[Capa 2 — Claude Agent SDK]
  Agente tester:
  → Lee definiciones de tipos → Identifica tech stack del proyecto objetivo
  → Escribe código de prueba directamente (herramienta Write)
  → Ejecuta via Bash (framework de pruebas del proyecto objetivo)
  → ¿Jest? ¿pytest? ¿go test? → Lo que se decidió en la spec de Capa 1

  Ciclo TDD:
  → tester escribe pruebas que fallan primero
  → coder implementa para que pasen
  → 1 fallo → parada inmediata → qc causa raíz → coder corrige → reiniciar

  Rol CI:
  → E2E de integración en cascada tras completar funcionalidad
  → Verificación de regresión de que las nuevas funcionalidades no rompen las existentes
```

---

## 3. Comparación de la Fórmula Central

### Fórmula de Harness Engineering

```
Agente = Modelo + Arnés
Arnés = Constrain + Inform + Verify + Correct
```

### Fórmula de adev

```
adev = Arnés (orquestador TypeScript/Bun)
     + Agentes de Claude Agent SDK (Modelo)

Arnés de adev:
  Constrain:
    - Dependencias de módulos unidireccionales (layer-dependencies.md)
    - Lista de allowedTools (restricciones de herramientas por agente)
    - Separación de autoridad de codificación por agente (solo coder puede codificar)
    - Aislamiento de ramas Git (previene conflictos de archivos en Coder×N)
    - 7 agentes fijos (adiciones/cambios prohibidos)
    - settingSources: [] (elimina dependencia de configuración del filesystem)

  Inform:
    - Contract de Capa 1 (HandoffPackage): Intención de planificación → Spec de desarrollo
    - 7 archivos agent.md: Guías de rol por agente (auto-generadas para spec del proyecto)
    - SKILL.md: Inyección de conocimiento de dominio
    - LanceDB RAG: Historial de decisiones de diseño, historial de fallos — inyección de búsqueda en tiempo real
    - Definición de Tipos de Casos de Prueba: Estándar de comportamiento del agente tester

  Verify:
    - tester: Genera + ejecuta código de prueba del proyecto objetivo (herramienta Bash)
    - Fail-Fast: 1 fallo → parada inmediata (reiniciar desde el principio)
    - Verificación de 4 capas: qa/qc → reviewer → intención Capa 1 → adev comprehensivo
    - Escalada automática Haiku → Sonnet → Opus

  Correct:
    - qc: Enfoque en 1 sola causa raíz → instruir a coder para corregir
    - failure-handler: Clasificar tipo de fallo → retornar a Phase apropiada
    - bias-detector: Detectar sesgo de confirmación/bucles/deadlocks/expansión de alcance → reiniciar sesión
    - session-restore-orchestrator: Expiración de token → restauración basada en LanceDB
    - bug-escalator: Bugs de Capa 3 → re-ejecutar todo el bucle de Capa 2
```

---

## 4. Análisis Comparativo de las 4 Funciones de HE

### ① Constrain — Restricción

| Principio HE              | Archivo de Implementación adev | Contenido                                              | Estado |
| ------------------------- | ------------------------------ | ------------------------------------------------------ | ------ |
| Límites arquitectónicos   | `layer-dependencies.md`        | Dependencias unidireccionales + sin circulares         | ✅     |
| Restricciones de herramienta | `v2-session-factory.ts`     | `allowedTools` especificado por Phase/agente           | ✅     |
| Aplicación de estilo de código | `agent.md` (guía coder)  | Convenciones del proyecto objetivo — decididas en spec | ✅     |
| Sin mezcla de roles       | `AGENT-ROLES.md`               | Solo coder codifica, solo tester prueba, qc solo analiza | ✅   |
| Prevención de conflictos  | `coder-allocator.ts`           | Sin edición del mismo archivo entre Coder×N            | ✅     |
| Número de agentes fijo    | Spec §7                        | Fijo en 7 (adiciones/cambios prohibidos)               | ✅     |
| Eliminación de dep. env.  | `v2-session-factory.ts`        | `settingSources: []`                                   | ✅     |
| **Principio Vercel**      | allowedTools por Phase         | Solo herramientas necesarias por rol; excluir extras   | ✅     |

### ② Inform — Información

| Principio HE         | Implementación adev                                | Contenido                                                                      | Estado         |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ | -------------- |
| Provisión de spec    | `contract-builder.ts`                              | Contract (HandoffPackage) — Kahn topological sort, matriz de verificación      | ✅             |
| Guías de rol         | `agent-md-generator.ts`                            | 7 archivos agent.md — auto-generados por spec del proyecto                     | ✅             |
| Conocimiento dominio | `skill-merger.ts`                                  | Inyección de fusión global + proyecto SKILL.md                                 | ✅             |
| Conv. de codificación | Decisión de spec Capa 1                           | Convenciones definidas en spec proyecto objetivo → reflejadas en agent.md      | ✅             |
| Registros de progreso | `progress-tracker.ts`, `session-snapshot-store.ts` | Seguimiento de progreso a nivel de funcionalidad/Phase                        | ✅             |
| Contexto dinámico    | `src/rag/` LanceDB RAG                             | Decisiones de diseño similares, historial de fallos — búsqueda en tiempo real  | ✅ (Supera HE) |
| Estándar de pruebas  | `test-type-designer.ts`                            | Definición de tipos (12 categorías, 80% aleatorio) → pasado al agente tester   | ✅ (No en HE)  |
| Spec de traspaso     | `handoff-receiver.ts`                              | Capa 1 → Capa 2 recepción de Contract + validación estructural/consistencia    | ✅ (No en HE)  |

### ③ Verify — Verificación

| Principio HE              | Implementación adev          | Contenido                                                 | Estado         |
| ------------------------- | ---------------------------- | --------------------------------------------------------- | -------------- |
| Pruebas automatizadas     | Agente tester                | **Genera + ejecuta código de prueba via Bash**            | ✅             |
| TDD                       | Orden tester → coder         | Pruebas que fallan primero, coder implementa para pasar   | ✅             |
| Rol CI                    | E2E de integración en cascada | Verificación de regresión tras completar funcionalidad   | ✅             |
| Fail-Fast                 | `integration-tester.ts`      | 1 fallo → parada inmediata, reiniciar desde el principio  | ✅ (Estricto)  |
| Seguridad de tipos        | Guías agente coder           | Comprobaciones de tipo del proyecto objetivo              | ✅             |
| Revisión de código        | Agente reviewer              | Juicio de calidad en sesión independiente                 | ✅             |
| **Verificación 4 capas**  | `verification-gate.ts`       | qa/qc → reviewer → intención Capa 1 → adev comprehensivo | ✅ (Supera HE) |
| **Verificación de intención** | `layer1-verifier.ts`     | "¿Se implementó como lo planeé?" (Capa 1 Claude API)      | ✅ (No en HE)  |
| **Detección de sesgo**    | `bias-detector.ts`           | Detecta sesgo de confirmación/bucles/deadlocks            | ✅ (No en HE)  |
| **Escalada de verificación** | `verification-escalator.ts` | Haiku → Sonnet → Opus automático                       | ✅ (No en HE)  |

### ④ Correct — Corrección

| Principio HE           | Implementación adev               | Contenido                                              | Estado              |
| ---------------------- | --------------------------------- | ------------------------------------------------------ | ------------------- |
| Bucles de retro.       | `team-leader-phase.ts`            | Fallo → clasificar tipo → retornar a Phase apropiada   | ✅                  |
| Auto-reparación        | `failure-handler.ts`              | Auto-determinar estrategia de recuperación por tipo    | ✅                  |
| Continuidad de sesión  | `session-restore-orchestrator.ts` | `unstable_v2_resumeSession` + restauración vectorial   | ✅                  |
| **Foco en causa raíz** | Agente qc                         | Solo 1 (sin multi-análisis → garantiza Fail-Fast)      | ✅ (Específica HE)  |
| **Memoria de patrones** | `failure-store.ts`               | Almacena vectores de fallos → inyección RAG            | ✅ (No en HE)       |
| **Escalada de bugs**   | `bug-escalator.ts`                | Bugs Capa 3 → re-ejecutar todo el bucle de Capa 2      | ✅ (No en HE)       |

---

## 5. Comparación de Implementación TDD / CI

### Enfoque TDD/CI Recomendado por HE

```
TDD: Escribir prueba que falla primero → Implementar para pasar → Refactorizar
CI: Ejecutar pruebas automáticamente en commit → Bloquear merge en caso de fallo
```

HE recomienda "usar TDD y CI" pero **deja la implementación específica a cada equipo**.

### TDD/CI de adev — Flujo Completo

```
[Capa 1 — Definición de Tipos de Prueba (no código real)]

  Capa 1 Claude API genera:
  - 12 categorías de prueba (normal/límite/excepción/concurrencia/alto volumen/
    terminación anormal, etc.)
  - Reglas/patrones/valores límite/rangos de entrada por categoría
  - 100-200 casos de muestra
  - Regla de ratio aleatorio 80%+
  - Conteos objetivo: Unit 10k / Module 10k / E2E 100k+ (configurable)
  - Incluido en Contract → pasado al agente tester de Capa 2

[Capa 2 — Agente tester genera + ejecuta código de prueba real]

  Agente tester (instancia Claude Agent SDK V2):
    ① Leer definiciones de tipos → identificar tech stack del proyecto objetivo
       (Python → pytest, TypeScript → Jest/Vitest, Go → go test, etc.)
    ② Escribir código de prueba según reglas de definición (herramienta Write)
       - Prueba Unit: nivel función/método
       - Prueba Module: integración entre módulos
       - Prueba E2E: ciclo de vida completo del escenario de usuario real
    ③ Ejecutar via herramienta Bash:
       `pytest tests/` o `jest` o `bun test` — según tech stack de spec
    ④ Fail-Fast: 1 fallo → parada inmediata → reportar a qc

[Ciclo TDD]
  tester: escribe prueba que falla
  coder: implementa para que pase (rama Git del módulo objetivo)
  tester: re-ejecuta → confirma que pasa
  → Todas las Unit pasan → Iniciar Module → Module pasa → Iniciar E2E

[Rol CI — E2E de Integración en Cascada (Capa2-B)]
  Tras completar todas las funcionalidades:
  Step1: E2E 100k+ de funcionalidad modificada (verificación de completitud)
  Step2: E2E 10k de funcionalidades relacionadas (regresión)
  Step3: E2E 1k de funcionalidades no relacionadas (smoke: impacto del sistema)
  Step4: E2E final de integración 1M (simulación de producción)
  Fallo en cualquier Step → parada inmediata → reiniciar todo el bucle Capa2-A
```

| Ítem                   | HE Recomendado              | Implementación adev                                    |
| ---------------------- | --------------------------- | ------------------------------------------------------ |
| Generación de spec     | El desarrollador lo hace    | **Capa 1 Claude API auto-genera definiciones de tipos** |
| Generación de código   | El desarrollador lo hace    | **Agente tester auto-genera de definiciones de tipos** |
| Ejecución de pruebas   | Herramienta CI (Jenkins, etc.) | **Agente tester ejecuta directamente via Bash**     |
| Framework de pruebas   | El equipo decide            | **Exactamente el tech stack decidido en spec Capa 1**  |
| Orden TDD              | Recomendado (baja adherencia) | **Aplicado (orden tester → coder fijo)**             |
| Manejo de fallos       | El desarrollador analiza    | **Agente qc análisis automático de causa raíz**        |
| Escala CI              | Pruebas por commit          | **Por funcionalidad: Unit 10k + Module 10k + E2E 100k** |
| Escala de integración  | Pipeline de deployment      | **Final en cascada 1M ejecuciones**                    |
| Pruebas de regresión   | Pipeline CI                 | **Step2 (relacionadas 10k) + Step3 (no relacionadas 1k) automático** |

---

## 6. Comparación de Orquestación de Agentes

### Recomendación de HE de Anthropic: Estructura Lineal de 2 Agentes

```
Inicializador → [Agente de Codificación × número de funcionalidades] secuencial
1 funcionalidad por sesión, traspaso de estado via progress.txt
```

### LangChain DeepAgents: Estructura Jerárquica

```
Agente Principal
  └─ Sub-agentes (generados dinámicamente según necesidad)
     Filesystem / Planning / Memory / Code Exec
```

### adev: Phase FSM + Separación de Roles + Desarrollo Paralelo

```
adev (TypeScript/Bun) = Líder de Equipo = Orquestador
  │
  ├─ Phase DESIGN [Agent Teams habilitado]
  │    session.stream() + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  │    → agente líder crea Equipo → genera architect, qa, coder, reviewer como compañeros
  │    → Discusión de equipo via SendMessage (decisiones de diseño)
  │    → Puerta qa pasada + consenso total → entrar a Phase CODE
  │    → Al salir: activar documenter (generar docs de diseño)
  │
  ├─ Phase CODE [Sin Agent Teams, ejecución paralela independiente]
  │    unstable_v2_prompt() × N (Promise.allSettled)
  │    → coder1: rama feature/nombreFunc-moduloA-coder1
  │    → coder2: rama feature/nombreFunc-moduloB-coder2
  │    → coderN: rama feature/nombreFunc-moduloN-coderN
  │    architect + reviewer: sesiones de supervisión separadas (sin codificación)
  │    → adev fusiona en orden del grafo de dependencias
  │    → Al completar: activar documenter (actualizar CHANGELOG)
  │
  ├─ Phase TEST [Fail-Fast secuencial]
  │    unstable_v2_prompt() ejecución secuencial
  │    → tester: genera código de prueba de definiciones de tipos (herramienta Write)
  │               ejecuta pruebas del proyecto objetivo via herramienta Bash
  │               Unit 10k → (parar inmediatamente en fallo) → Module 10k → E2E 100k
  │    → qc: analiza 1 causa raíz en fallo
  │    → coder: corrige solo ese bug (Fail-Fast: solo 1)
  │    → tester: reiniciar esa phase desde el principio
  │    → Al completar/fallar: activar documenter (informe de pruebas)
  │
  └─ Phase VERIFY [4 capas secuencial]
       unstable_v2_prompt() secuencial
       ① qa/qc: cumplimiento de spec + verificación de pruebas pasadas
       ② reviewer: calidad de código + cumplimiento de patrones
       ③ Capa 1 Claude API: "¿Se implementó como lo planeé?"
       ④ adev: combinar los 3 anteriores + verificación de sesgo de confirmación
       Fallo → retornar a DESIGN/CODE/TEST según tipo
```

| Ítem               | Anthropic 2 Agentes | LangChain DeepAgents | adev                                      |
| ------------------ | ------------------- | -------------------- | ----------------------------------------- |
| Número de agentes  | 2                   | Variable             | 7 fijos                                   |
| Estructura         | Lineal secuencial   | Jerárquica           | Phase FSM                                 |
| Desarrollo paralelo | Ninguno            | Parcial              | Coder×N Promise.allSettled                |
| Aislamiento Git    | Ninguno             | Ninguno              | rama feature + fusión en orden de dependencia |
| Discusión en equipo | Ninguno            | Ninguno              | DESIGN Phase Agent Teams                  |
| Detección de sesgo | Ninguno             | Ninguno              | bias-detector (bucle/deadlock/sesgo de confirmación) |
| Verificación de intención | Ninguno    | Ninguno              | Capa 1 compara intención de planificación vs implementación |
| Método de monitoreo | Ninguno            | Ninguno              | Hook (PreToolUse/PostToolUse) + polling IPC |

---

## 7. Comparación de Contexto y Memoria

### HE de Anthropic: claude-progress.txt

```
[Completado] feature-1: Autenticación de usuario
[En Progreso] feature-2: Lista de productos (50%)
[Pendiente] feature-3: Pago
```

- Pros: Simple, legible por humanos
- Limitaciones: Análisis de texto, sin tipos, sin búsqueda de patrones pasados, desperdicio de tokens

### adev: 4 Tablas LanceDB + RAG

| Tabla               | Almacena                              | Usado Cuando                                     |
| ------------------- | ------------------------------------- | ------------------------------------------------ |
| `memory`            | Historial de conversación, feedback   | Contexto de la siguiente conversación            |
| `code_index`        | Vectores de código del proyecto       | Búsqueda de código, prevención de duplicados     |
| `design_decisions`  | Historial de "por qué se diseñó así"  | Consistencia, prevenir re-examinar decisiones    |
| `failures`          | Causas de fallos + vectores solución  | Prevención de recurrencia — alerta RAG           |
| `session_snapshots` | Estado de sesión (añadido fuera spec) | Restauración precisa tras expiración de token    |

**Flujo de inyección de contexto dinámico**:

```
Agente comienza tarea
  → Vectorizar contexto actual
  → Búsqueda de similitud LanceDB:
      Buscar decisiones de diseño similares en design_decisions
      Buscar historial de fallos similares en failures
      Buscar código relacionado en code_index
  → Inyectar resultados de búsqueda dinámicamente en el prompt del agente
  → El agente toma mejores decisiones referenciando patrones aprendidos del pasado
```

| Ítem                    | HE progress.txt   | adev LanceDB                             |
| ----------------------- | ----------------- | ---------------------------------------- |
| Formato de almacenamiento | Texto           | DB Vectorial (tipo seguro)               |
| Búsqueda de patrones    | No posible        | Búsqueda de similitud (semántica)        |
| Prevención de recurrencia | Ninguna         | failure-store → alerta RAG               |
| Consistencia de diseño  | Ninguna           | design-decision-store → decisiones pasadas |
| Eficiencia de tokens    | Cargar todo el archivo | Buscar e inyectar solo ítems relevantes |
| Persistencia            | Archivo (volátil) | DB embebida (persistencia estructurada)  |

---

## 8. Comparación de Continuidad de Sesión

### El Problema Central de HE: "Todo el contexto se pierde cuando la sesión se interrumpe"

Solución de Anthropic:

```
Al inicio de cada sesión del Agente de Codificación:
  1. Leer claude-progress.txt → identificar posición actual
  2. Implementar solo 1 funcionalidad
  3. Completar → actualizar registro → terminar sesión
  4. Repetir el mismo proceso en la siguiente sesión
```

### Estrategia de Continuidad de Sesión de adev

```
[Cuando se alcanza el límite de tokens — token-monitor.ts]
  20% restante → suprimir generación de nuevas sesiones (terminar solo las en curso)
  5% restante  → modo de finalización elegante (sin nuevas tareas)
  Tokens agotados → token-wait-loop.ts: verificar cada 1 min, esperar hasta 1 hora

[Restauración de sesión — session-restore-orchestrator.ts]
  1. Cargar último snapshot de session-snapshot-store
  2. Intentar unstable_v2_resumeSession(sessionId)
  3. En caso de fallo: nueva sesión + reconstrucción de contexto vectorial LanceDB
  4. Reanudar exactamente donde se interrumpió

[Sistema de ID de Sesión]
  {projectId}:{featureId}:{agentName}:{phase}
  Ejemplo: "proj-001:feat-auth:architect:DESIGN"
  → Rastrear qué proyecto, funcionalidad, agente y phase
```

---

## 9. Similitudes

### 1. Filosofía Central: "El arnés es más difícil que el modelo"

- HE: Los fallos de los agentes son problemas del entorno de orquestación, no deficiencias de capacidad del modelo
- adev: La mayoría de los 201 archivos y 32,681 líneas es código de arnés (orquestación)

### 2. La Continuidad de Contexto entre Sesiones es Esencial

- HE (Anthropic): `claude-progress.txt` para traspaso de sesión
- adev: `session-snapshot-store` + LanceDB + `unstable_v2_resumeSession`

### 3. Las Restricciones Producen Mejores Resultados que la Libertad

- HE (Vercel): Reducir herramientas en 80% mejoró la tasa de éxito
- adev: Separación de autoridad de codificación por rol, restricciones allowedTools por Phase, 7 agentes fijos

### 4. TDD + Fail-Fast son Esenciales

- HE: Recomienda TDD y bucles de retroalimentación rápidos como núcleo
- adev: Orden tester → coder aplicado, 1 fallo → parada inmediata, reiniciar desde el principio (aplicación estricta)

### 5. Unidades de Trabajo Basadas en Git

- HE (Anthropic): 1 funcionalidad → commit → fin de sesión
- adev: 1 funcionalidad → rama feature/{func}-{modulo}-coderN → fusión en orden de dependencia

### 6. La Especificación es el Estándar del Comportamiento del Agente

- HE: "Proporcionar a los agentes especificaciones claras"
- adev: Contract (HandoffPackage) — incluye lista de funcionalidades, criterios de aceptación, tipos E/S, definiciones de tipos de prueba

### 7. Separación de Roles

- HE (LangChain): Separación de roles Agente principal + Sub-agentes
- adev: 7 agentes con separación estricta de roles (mezcla absolutamente prohibida)

### 8. Ingeniería de Contexto

- HE: Proporcionar contexto correcto = núcleo del rendimiento del agente
- adev: agent.md (guías de rol) + SKILL.md (conocimiento de dominio) + LanceDB RAG (dinámico)

### 9. Auto-Reparación

- HE: Fallo → análisis de causa raíz → reintento
- adev: qc (foco en 1 causa raíz) + failure-handler (retorno a Phase por tipo de fallo)

### 10. Aislamiento Multi-Proyecto

- HE: Recomienda configuración de arnés por proyecto
- adev: `projects.json` + aislamiento `.adev/` + prioridad de configuración (proyecto > global)

---

## 10. Diferencias — Distinciones Clave

### La Diferencia Más Fundamental: Metodología vs Implementación

```
Harness Engineering:  "¿Cómo debe diseñarse un arnés de agente?" — Presenta principios/patrones
adev: Un sistema completo que implementa principios de HE + más en código TypeScript real
```

### 12 Diferencias Clave

| #   | Ítem                    | Harness Engineering (Metodología) | adev (Implementación)                             |
| --- | ----------------------- | --------------------------------- | ------------------------------------------------- |
| 1   | **Naturaleza**          | Principios/disciplina/metodología | Software inmediatamente ejecutable                |
| 2   | **Spec TDD**            | "Usa TDD"                         | Capa 1 auto-genera definiciones de tipos de prueba |
| 3   | **Implementación TDD**  | El desarrollador lo hace          | Agente tester ejecuta via Bash                    |
| 4   | **CI**                  | "Usa CI"                          | Hasta 110,000 por funcionalidad + 1M final        |
| 5   | **Traspaso planif.→dev** | No definido                      | Contract (HandoffPackage) + ordenamiento topológico |
| 6   | **Memoria**             | Archivo de texto                  | LanceDB vectorial 4 tablas + RAG                  |
| 7   | **Contexto dinámico**   | No definido                       | Búsqueda RAG en tiempo real de historial de fallos/diseño |
| 8   | **Verificación**        | Pruebas automatizadas 1 capa      | 4 capas (qa/qc → reviewer → Capa 1 → adev)       |
| 9   | **Verif. de intención** | No definido                       | Capa 1 compara intención de planificación vs implementación |
| 10  | **Detección de sesgo**  | No definido                       | bias-detector (sesgo de confirmación/bucles/deadlocks) |
| 11  | **Gestión de tokens**   | Sin resolver                      | Ventana deslizante + finalización elegante + restauración |
| 12  | **Entregables**         | Solo código                       | Código + 8 docs + 4 entregables de negocio        |

### Lo que adev Resuelve que HE No Aborda

```
① Fase de planificación (Capa 1)
   HE: "Proporcionar especificaciones" — quién las crea y cómo no está definido
   adev: Genera la spec misma a través de conversación con el usuario via Claude API

② Automatización de spec de pruebas
   HE: "Escribir pruebas" — cuáles y cuántas no está definido
   adev: Auto-genera definiciones de tipos (12 categorías, 80% aleatorio, conteos objetivo)

③ Gestión del límite de tokens
   El problema más práctico para agentes de larga ejecución — sin resolver en ningún lugar de HE
   adev: Ventana deslizante de 5 horas, respuesta por umbral, restauración de sesión

④ E2E Continuo (Capa 3)
   HE: Sin mención de gestión después de completar el código
   adev: E2E continuo cada 5 min → bug → re-ejecución automática de Capa 2

⑤ Entregables de negocio
   HE: Solo código
   adev: Portfolio, plan de negocio, propuesta de inversión, presentación PPTX auto-generados
```

---

## 11. Fortalezas de adev

### Fortaleza 1: La Única Estructura que Realmente Impone TDD

HE recomienda TDD pero las tasas reales de adherencia son bajas. adev **impone estructuralmente TDD con el orden fijo tester → coder**. El agente tester debe escribir pruebas que fallan antes de que el agente coder pueda comenzar a codificar.

### Fortaleza 2: Verificación de Intención de Planificación vs Implementación

Un concepto no presente en HE. En el 3er paso de la verificación de 4 capas, **Capa 1 (planificador) verifica directamente el resultado de Capa 2 (implementación)**. "¿Se implementó como lo diseñé?" — No solo verificar que las pruebas pasen, sino confirmar que la intención fue implementada.

### Fortaleza 3: Auto-Mejora a Través del Aprendizaje de Fallos

`failure-store.ts` — Almacena causas de fallos y soluciones como vectores. En situaciones similares futuras, busca via RAG para alertar a los agentes. **El sistema de agentes comete menos errores repetidos cuanto más opera**.

### Fortaleza 4: Contexto Dinámico — Superando HE

El progress.txt recomendado por Anthropic es estático. adev **busca decisiones pasadas relevantes en tiempo real via búsqueda de similitud LanceDB y las inyecta**. Los agentes reciben solo el contexto más relevante para las tareas actuales, no todo el historial.

### Fortaleza 5: Coder×N Paralelo + Aislamiento Git

Múltiples coders desarrollan una funcionalidad en paralelo. Distribuidos por módulo, cada uno trabajando en ramas Git independientes. Fusionados en orden del grafo de dependencias. **N× velocidad de desarrollo + cero conflictos de archivos**.

### Fortaleza 6: Gestión Automática del Límite de Tokens

El problema más práctico en sistemas de agentes de larga ejecución. Sin solución encontrada en ningún lugar de HE. adev habilita el **desarrollo de larga duración sin interrupciones** con ventanas deslizantes de 5 horas, respuestas por umbral (20%, 5%), bucles de espera de 1 hora y `unstable_v2_resumeSession`.

### Fortaleza 7: Detección de Sesgo de Confirmación

La implementación más sofisticada del principio Correct de HE. `bias-detector.ts` detecta patrones donde los agentes repiten direcciones erróneas (sesgo de confirmación, bucles, deadlocks, expansión de alcance). Al detectarlo: terminación forzada de sesión + reinicio con nueva sesión.

### Fortaleza 8: Ejecución Completamente Local

Sin servidor requerido. LanceDB es embebido (basado en archivos). Sin servicios externos más allá de la API de Anthropic. **Datos completamente preservados localmente**. La instalación es un único `curl one-liner` o `bun -g`.

---

## 12. Debilidades de adev / Áreas de Mejora

### Debilidad 1: E2E Real del Proyecto Objetivo No Ejecutado (Crítico)

**Estado actual**: 204,903 pruebas pasan para adev mismo (autonomous-dev-agent-ts), pero el **flujo completo de adev desarrollando autónomamente un proyecto objetivo real (conversación Capa 1 → Contract → desarrollo de agentes Capa 2 → entregables Capa 3) con E2E de API de Claude real no ha sido ejecutado**.

- Validado solo en forma de simulación (mock)
- `adev init` + `adev start` → flujo de llamada real a la API de Claude no verificado
- **Perspectiva de HE Verify**: El núcleo de la verificación es la prueba en "entorno real". Lo más importante está faltando.

### Debilidad 2: PoC de 7 Compañeros Simultáneos Incompleto

Spec §16: Solo confirmado hasta 5, ejecución simultánea de 7 no verificada.

- Límite superior real de N en desarrollo paralelo Coder×N incierto
- Perspectiva de HE Constrain: Límites reales de las restricciones poco claros

### Debilidad 3: Renderizadores PPTX/DOCX Incompletos

- PPTX: Comentario de código "no implementado", usando HTML fallback
- DOCX: Usando HTML fallback
- PDF: 3 fallos de prueba debido a pdfkit no instalado (solucionable inmediatamente con bun install)
- Spec de entregables de negocio de Capa 3 incompleta

### Debilidad 4: Dependencia de Proveedor de IA Único

Claude Agent SDK = Solo Anthropic. Sin soporte para GPT, Gemini o LLMs locales.

- El sistema completo se detiene ante aumentos de precio de API o interrupciones de servicio
- La tendencia de HE sugiere: "El arnés debe ser independiente del modelo"

### Debilidad 5: Garantía de Calidad del Código de Prueba del Agente tester Incierta

- Sin validación de calidad del propio código de prueba generado por el agente tester
- Mecanismo para detectar "pruebas sin sentido" (pruebas escritas para siempre pasar) no implementado
- Perspectiva de HE Verify: Se necesita garantía de calidad de las propias herramientas de verificación

### Debilidad 6: Opacidad de Dependencia del Tech Stack

Los comandos de prueba ejecutados por el agente tester via Bash dependen del entorno del proyecto objetivo.

- Si el proyecto objetivo tiene un entorno de pruebas inusual (necesita Docker, BD especial, etc.), el agente debe resolverlo solo
- El mecanismo de manejo de fallos para este proceso está insuficientemente detallado en la spec

### Debilidad 7: El Arnés en Sí No es Pluggable

La extensión MCP/Skill es posible, pero **la adición de Phases, adición de agentes y personalización de pasos de verificación no es posible**.

- Dirección a largo plazo de HE: El arnés en sí debe convertirse en una plataforma extensible
- Actualmente: 7 agentes fijos, 4 Phases fijas

### Debilidad 8: Minimización de Herramientas Necesita Revisión (Principio Vercel)

Vercel: Reducir herramientas en 80% mejoró la tasa de éxito.

- Existen restricciones allowedTools a nivel de Phase, pero si las herramientas proporcionadas a cada agente están minimizadas necesita re-examinarse
- Especialmente hay margen para la optimización de selección de herramientas en escenarios de Agent Teams en Phase DESIGN

---

## 13. Matriz de Evaluación Integral

### Basada en las 4 Funciones de HE

| Función HE    | Sub-ítem                   | Nivel adev | Notas                                          |
| ------------- | -------------------------- | ---------- | ---------------------------------------------- |
| **Constrain** | Límites arquitectónicos    | ★★★★★      | Dependencias unidireccionales aplicadas        |
|               | Restricciones de herramienta | ★★★★☆    | allowedTools por Phase — margen de optimización |
|               | Separación de roles        | ★★★★★      | 7 agentes estrictamente separados              |
|               | Prevención de conflictos   | ★★★★★      | Aislamiento Git a nivel de módulo              |
| **Inform**    | Automatización de spec     | ★★★★★      | Contract + definiciones de tipos (no en HE)    |
|               | Guías de rol               | ★★★★★      | agent.md generado por proyecto                 |
|               | Contexto dinámico          | ★★★★★      | LanceDB RAG (supera HE)                        |
|               | Seguimiento de progreso    | ★★★★☆      | session-snapshot — validación real necesaria   |
| **Verify**    | Aplicación TDD             | ★★★★★      | Orden tester → coder fijo                      |
|               | Auto-generación de pruebas | ★★★★☆      | Basado en definiciones de tipos — garantía de calidad necesaria |
|               | Rol CI                     | ★★★★★      | En cascada + 1M final                          |
|               | Fail-Fast                  | ★★★★★      | Aplicado estrictamente                         |
|               | Verificación multi-capa    | ★★★★★      | 4 capas (supera HE)                            |
|               | Verificación de intención  | ★★★★★      | Intención Capa 1 vs implementación (no en HE)  |
| **Correct**   | Bucles de retroalimentación | ★★★★★     | failure-handler + retorno a Phase              |
|               | Análisis de causa raíz     | ★★★★★      | qc dedicado (enfoque en 1)                     |
|               | Aprendizaje de fallos      | ★★★★★      | failure-store RAG (no en HE)                   |
|               | Restauración de sesión     | ★★★★☆      | Validación E2E real necesaria                  |

### Resumen de Posición de adev

```
Harness Engineering (Principios de Metodología)
  ↑ Referenciado como implementación
  adev
    ✅ Todas las 4 funciones de HE implementadas
    ✅ Supera HE en múltiples áreas:
         - Contexto dinámico LanceDB RAG
         - Aprendizaje de fallos (failure-store)
         - Verificación de 4 capas + verificación de intención
         - Detección de sesgo de confirmación
         - Gestión de tokens
         - Traspaso basado en Contract
    ⚠️ Incompleto/No verificado:
         - Flujo E2E real (más importante)
         - Renderizadores PPTX/DOCX
         - PoC de 7 agentes simultáneos
    ❌ Faltante:
         - Extensibilidad más allá de proveedor de IA único
         - El arnés en sí como plataforma pluggable
```

---

_Fecha de análisis: 2026-03-13_
_Fuentes: OpenAI Harness Engineering (2026-02) / Anthropic Engineering Blog / martinfowler.com Birgitta Böckeler / LangChain DeepAgents / adev-spec-full-v2_4.md / docs/references/_
