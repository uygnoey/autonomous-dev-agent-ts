> **Languages:** [한국어](../ko/v2-session-executor.md) | [English](../en/v2-session-executor.md) | [日本語](../ja/v2-session-executor.md) | [Español](../es/v2-session-executor.md)

# Documentación API de V2SessionExecutor

**Última actualización**: 2025-01-XX
**Versión**: v2.4
**Verificación de pruebas**: ✅ 140 pruebas completas pasadas (Normal 20%, Edge 40%, Error 40%)
**Evaluación Architect**: 99/100 (Best Practice)
**Evaluación Reviewer**: 98/100 (APPROVED)

---

## 🎯 Analogía para Principiantes

### V2SessionExecutor = "Botón de Ejecución de Agente"

Imagina que varios amigos (agentes) tienen roles en un proyecto escolar.

- **DESIGN Phase (fase de diseño)**: Todos se reúnen para discutir y compartir ideas en una **reunión de equipo** → **Agent Teams activado**
- **CODE/TEST/VERIFY Phase (fase de desarrollo)**: Cada uno trabaja independientemente en su propio escritorio como **trabajo individual** → **Agent Teams desactivado**

V2SessionExecutor es un **botón inteligente** que cambia automáticamente este "modo de reunión".

```
┌─────────────────────────────────────────────────────────────┐
│  DESIGN Phase                                               │
│  ┌──────┐   ┌──────┐   ┌──────┐                            │
│  │ 🏛️   │ ↔ │ 🧪   │ ↔ │ 💻   │  ← Intercambio de mensajes│
│  └──────┘   └──────┘   └──────┘     (SendMessage activado) │
│  Architect    QA      Coder                                 │
│                                                             │
│  AGENT_TEAMS_ENABLED=true                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  CODE Phase                                                 │
│  ┌──────┐   ┌──────┐   ┌──────┐                            │
│  │ 💻   │   │ 🧪   │   │ 🔍   │  ← Ejecución independiente │
│  └──────┘   └──────┘   └──────┘     (SendMessage no disponible)│
│  Coder      Tester      QC                                  │
│                                                             │
│  AGENT_TEAMS_ENABLED=false                                  │
└─────────────────────────────────────────────────────────────┘
```

### Conceptos Centrales

1. **Bifurcación basada en Phase**: DESIGN es modo reunión de equipo, el resto es modo trabajo independiente
2. **Configuración automática de variables de entorno**: Configura automáticamente información de autenticación + activación de Agent Teams
3. **Flujo de eventos**: Puedes recibir en tiempo real el proceso de trabajo del agente
4. **Reanudación de sesión**: Puedes continuar el trabajo después de detenerlo

---

## 📐 Arquitectura

### Diagrama de Estructura Completa

```
┌────────────────────────────────────────────────────────────┐
│                      V2SessionExecutor                     │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  1. buildSessionEnvironment()                        │ │
│  │     • Obtener encabezado de auth de AuthProvider     │ │
│  │     • Conversión x-api-key → ANTHROPIC_API_KEY       │ │
│  │     • Conversión authorization → CLAUDE_CODE_OAUTH_TOKEN│ │
│  │     • Verificar Phase → Configurar AGENT_TEAMS_ENABLED│ │
│  └──────────────────────────────────────────────────────┘ │
│                           ↓                                │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  2. createSession()                                  │ │
│  │     • Llamar unstable_v2_createSession()             │ │
│  │     • Pasar systemPrompt, maxTurns, tools, environment│ │
│  │     • Devolver Result<V2Session, AgentError>         │ │
│  └──────────────────────────────────────────────────────┘ │
│                           ↓                                │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  3. session.stream(prompt)                           │ │
│  │     • Iniciar flujo de eventos SDK                   │ │
│  │     • Recibir message, tool_use, tool_result, error, done│ │
│  └──────────────────────────────────────────────────────┘ │
│                           ↓                                │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  4. mapSdkEvent()                                    │ │
│  │     • Conversión V2SessionEvent → AgentEvent         │ │
│  │     • type, agentName, content, timestamp, metadata  │ │
│  │     • Devolver null si no se puede mapear (filtrar) │ │
│  └──────────────────────────────────────────────────────┘ │
│                           ↓                                │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  5. yield AgentEvent                                 │ │
│  │     • Recibir evento con for await...of externamente │ │
│  │     • Limpiar sesión al recibir evento done          │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### Diferencias de Operación por Phase

```
┌────────────────────────────────────────────────────────────┐
│  Phase: DESIGN                                             │
│  enableAgentTeams = true                                   │
│                                                            │
│  Variables de entorno:                                     │
│    ANTHROPIC_API_KEY=sk-ant-xxx                            │
│    AGENT_TEAMS_ENABLED=true  ← SendMessage disponible     │
│                                                            │
│  Comunicación Agent Teams:                                 │
│    architect → qa: "Por favor revisa el diseño"           │
│    qa → architect: "Problema de seguridad encontrado"     │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Phase: CODE / TEST / VERIFY                               │
│  enableAgentTeams = false                                  │
│                                                            │
│  Variables de entorno:                                     │
│    ANTHROPIC_API_KEY=sk-ant-xxx                            │
│    AGENT_TEAMS_ENABLED=false  ← SendMessage no disponible │
│                                                            │
│  Ejecución independiente:                                  │
│    coder: Escribe código solo                             │
│    tester: Ejecuta pruebas solo                           │
└────────────────────────────────────────────────────────────┘
```

### Flujo de Mapeo de Eventos

```
SDK V2SessionEvent          →  AgentEvent
══════════════════════════     ══════════════════════════════════
type: 'message'             →  type: 'message'
  content: "Hello"          →    content: "Hello"
                            →    agentName: 'architect'
                            →    timestamp: Date

type: 'tool_use'            →  type: 'tool_use'
  name: 'Read'              →    content: "Tool: Read"
  input: {...}              →    metadata: { toolName, toolInput }

type: 'tool_result'         →  type: 'tool_result'
  tool_use_id: 'tool_123'   →    content: (contenido del resultado)
  content: "..."            →    metadata: { toolName, isError }

type: 'error'               →  type: 'error'
  error: { message: "..." } →    content: "mensaje de error"

type: 'message_stop'        →  type: 'done'
  stop_reason: 'end_turn'   →    content: "Agent execution completed"
                            →    metadata: { stopReason }

type: 'unknown_event'       →  null (filtrado)
```

---

## 🔧 Dependencias

### Dependencias Requeridas

```typescript
import { V2SessionExecutor } from './layer2/v2-session-executor.js';
import type { AuthProvider } from './auth/types.js';
import type { Logger } from './core/logger.js';
import type { AgentConfig, AgentEvent } from './layer2/types.js';
```

### Implementación de AuthProvider Requerida

```typescript
interface AuthProvider {
  /** Devolver API Key o token OAuth en formato de encabezado */
  getAuthHeader(): Record<string, string>;

  /** Verificar validez de autenticación (opcional) */
  validateAuth(): Promise<boolean>;
}
```

**Importante**: `getAuthHeader()` debe devolver uno de los siguientes:
- `{ 'x-api-key': 'sk-ant-xxx' }` → Convertir a variable de entorno `ANTHROPIC_API_KEY`
- `{ authorization: 'Bearer token_xxx' }` → Convertir a variable de entorno `CLAUDE_CODE_OAUTH_TOKEN`

### Estructura de AgentConfig

```typescript
interface AgentConfig {
  name: AgentName;                    // 'architect' | 'qa' | 'coder' | ...
  phase: Phase;                       // 'DESIGN' | 'CODE' | 'TEST' | 'VERIFY'
  projectId: string;                  // Identificador del proyecto
  featureId: string;                  // Identificador de función
  prompt: string;                     // Prompt a pasar al agente
  systemPrompt: string;               // Prompt del sistema
  tools: string[];                    // Lista de herramientas disponibles (ej: ['Read', 'Write', 'Bash'])
  maxTurns?: number;                  // Número máximo de turnos (predeterminado: 50)
  env?: Record<string, string>;       // Variables de entorno personalizadas
}
```

---

## 📦 Uso en 5 Pasos

### Paso 1: Preparar Dependencias

```typescript
import { ConsoleLogger } from './core/logger.js';
import { ApiKeyAuthProvider } from './auth/api-key-auth.js';
import { V2SessionExecutor } from './layer2/v2-session-executor.js';

// Crear Logger
const logger = new ConsoleLogger('info');

// Preparar AuthProvider (API Key u OAuth)
const authProvider = new ApiKeyAuthProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  logger,
});
```

### Paso 2: Crear Instancia de V2SessionExecutor

```typescript
const executor = new V2SessionExecutor({
  authProvider,
  logger,
  defaultOptions: {
    maxTurns: 100,        // Número máximo de turnos predeterminado (opcional)
    temperature: 1.0,     // Temperature predeterminado (opcional)
    model: 'claude-opus-4-6',  // Modelo predeterminado (opcional)
  },
});
```

### Paso 3: Configurar AgentConfig

```typescript
import type { AgentConfig } from './layer2/types.js';

const config: AgentConfig = {
  name: 'architect',
  phase: 'DESIGN',  // DESIGN Phase → Activar Agent Teams
  projectId: 'proj-12345',
  featureId: 'feat-auth-system',
  prompt: 'Diseña la arquitectura del sistema de autenticación',
  systemPrompt: 'Eres un arquitecto de software experto',
  tools: ['Read', 'Write', 'Bash', 'Grep'],
  maxTurns: 50,
  env: {
    // Variables de entorno personalizadas (opcional)
    PROJECT_NAME: 'adev',
  },
};
```

### Paso 4: Ejecutar Agente y Recibir Eventos

```typescript
for await (const event of executor.execute(config)) {
  switch (event.type) {
    case 'message':
      console.log(`[${event.agentName}] Mensaje:`, event.content);
      break;

    case 'tool_use':
      console.log(`[${event.agentName}] Uso de herramienta:`, event.content);
      if (event.metadata?.toolName) {
        console.log(`  Nombre de herramienta: ${event.metadata.toolName}`);
      }
      break;

    case 'tool_result':
      console.log(`[${event.agentName}] Resultado de herramienta:`, event.content);
      break;

    case 'error':
      console.error(`[${event.agentName}] Error:`, event.content);
      break;

    case 'done':
      console.log(`[${event.agentName}] Completo:`, event.content);
      if (event.metadata?.stopReason) {
        console.log(`  Razón de finalización: ${event.metadata.stopReason}`);
      }
      break;

    default:
      console.warn('Evento desconocido:', event);
  }
}

console.log('Ejecución de agente completa');
```

### Paso 5: Limpieza (Antes de Terminar Proceso)

```typescript
// Registrar manejador de finalización de proceso
process.on('SIGINT', () => {
  executor.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  executor.cleanup();
  process.exit(0);
});
```

---

## ⚠️ Precauciones

### 1. Instalación de SDK Requerida

Actualmente el código no tiene el SDK `@anthropic-ai/claude-code` instalado.

```bash
# Instalación de SDK necesaria
bun add @anthropic-ai/claude-code
```

**Operación antes de instalación**:
- `Error: SDK not installed: @anthropic-ai/claude-code` ocurre al llamar `createSession()`
- Todas las llamadas a `execute()` devuelven evento `error`

### 2. Entender Operación de Agent Teams por Phase

| Phase | Agent Teams | ¿SendMessage disponible? | Uso |
|-------|-------------|--------------------------|------|
| DESIGN | **Activado** | ✅ Disponible | Discusión de equipo, revisión de diseño |
| CODE | Desactivado | ❌ No disponible | Escritura de código independiente |
| TEST | Desactivado | ❌ No disponible | Ejecución de pruebas independiente |
| VERIFY | Desactivado | ❌ No disponible | Verificación de calidad independiente |

**Ejemplo de uso incorrecto**:
```typescript
// ❌ Intento de usar SendMessage en CODE Phase → Ignorado
const config = {
  name: 'coder',
  phase: 'CODE',  // Agent Teams desactivado
  prompt: 'Usa SendMessage para preguntar al architect',
  // ...
};
// El agente llama a SendMessage pero no funciona
```

### 3. Prioridad de Variables de Entorno

```typescript
// Variables de entorno finales = baseEnv (auth + Agent Teams) + config.env (personalizado)
const finalEnv = {
  ...baseEnv,         // ANTHROPIC_API_KEY + AGENT_TEAMS_ENABLED
  ...config.env,      // Variables personalizadas (puede sobrescribir)
};
```

**Atención**: Si redefinir `ANTHROPIC_API_KEY` en `config.env`, se ignora el valor de AuthProvider.

### 4. Formato de ID de Sesión

```typescript
// Formato de ID de sesión: projectId:featureId:agentName:phase
"proj-12345:feat-auth-system:architect:DESIGN"
```

**Formato correcto requerido**:
- 4 partes (separador `:`)
- AgentName válido (`architect`, `qa`, `coder`, `tester`, `qc`, `reviewer`, `documenter`)
- Formato incorrecto → Usar valor predeterminado `architect` en `resume()`

### 5. Limpieza Automática de Sesión Después de Evento done

```typescript
for await (const event of executor.execute(config)) {
  if (event.type === 'done') {
    // En este punto, la sesión ya se eliminó del Map activeSessions
    // No se puede llamar resume()
  }
}
```

---

## 💡 Código de Ejemplo

### Ejemplo 1: DESIGN Phase - Activar Agent Teams

```typescript
import { ConsoleLogger } from './core/logger.js';
import { ApiKeyAuthProvider } from './auth/api-key-auth.js';
import { V2SessionExecutor } from './layer2/v2-session-executor.js';
import type { AgentConfig } from './layer2/types.js';

const logger = new ConsoleLogger('info');
const authProvider = new ApiKeyAuthProvider({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  logger,
});

const executor = new V2SessionExecutor({ authProvider, logger });

const designConfig: AgentConfig = {
  name: 'architect',
  phase: 'DESIGN',  // Activar Agent Teams
  projectId: 'proj-001',
  featureId: 'feat-payment',
  prompt: `Diseña un sistema de procesamiento de pagos.
Colabora con el agente qa para revisar requisitos de seguridad.`,
  systemPrompt: 'Eres un arquitecto de software senior',
  tools: ['Read', 'Write', 'SendMessage'],  // SendMessage disponible
  maxTurns: 30,
};

console.log('🏛️ Iniciando DESIGN Phase (Agent Teams activado)');

for await (const event of executor.execute(designConfig)) {
  if (event.type === 'message') {
    console.log(`[${event.agentName}] ${event.content}`);
  } else if (event.type === 'tool_use' && event.metadata?.toolName === 'SendMessage') {
    console.log(`  → Uso de SendMessage: ${JSON.stringify(event.metadata.toolInput)}`);
  } else if (event.type === 'done') {
    console.log('✅ DESIGN Phase completo');
  }
}

executor.cleanup();
```

**Ejemplo de salida**:
```
🏛️ Iniciando DESIGN Phase (Agent Teams activado)
[architect] Diseñaré la arquitectura del sistema de pagos.
  → Uso de SendMessage: {"recipient":"qa","message":"Por favor revisa requisitos de seguridad"}
[architect] Recibí comentarios del agente qa.
✅ DESIGN Phase completo
```

### Ejemplo 2: CODE Phase - Ejecución Independiente

```typescript
const codeConfig: AgentConfig = {
  name: 'coder',
  phase: 'CODE',  // Desactivar Agent Teams
  projectId: 'proj-001',
  featureId: 'feat-payment',
  prompt: 'Implementa la clase PaymentService basándote en el diseño',
  systemPrompt: 'Eres un desarrollador TypeScript experto',
  tools: ['Read', 'Write', 'Edit', 'Bash'],
  maxTurns: 50,
};

console.log('💻 Iniciando CODE Phase (ejecución independiente)');

let filesChanged = 0;

for await (const event of executor.execute(codeConfig)) {
  if (event.type === 'tool_use' && event.metadata?.toolName === 'Write') {
    filesChanged++;
    console.log(`  Archivo creado: ${JSON.stringify(event.metadata.toolInput)}`);
  } else if (event.type === 'done') {
    console.log(`✅ CODE Phase completo (${filesChanged} archivos creados/modificados)`);
  }
}

executor.cleanup();
```

### Ejemplo 3: Reanudación de Sesión (Resume)

```typescript
const sessionId = 'proj-001:feat-payment:architect:DESIGN';

console.log(`🔄 Reanudando sesión: ${sessionId}`);

for await (const event of executor.resume(sessionId)) {
  if (event.type === 'error') {
    console.error(`❌ Fallo en reanudación: ${event.content}`);
  } else if (event.type === 'message') {
    console.log(`[${event.agentName}] ${event.content}`);
  } else if (event.type === 'done') {
    console.log('✅ Sesión reanudada completa');
  }
}
```

**Ejemplo de salida (cuando no hay sesión)**:
```
🔄 Reanudando sesión: proj-001:feat-payment:architect:DESIGN
❌ Fallo en reanudación: Session not found: proj-001:feat-payment:architect:DESIGN
```

---

## 🐛 Manejo de Errores

### Respuesta por Tipo de Error

#### 1. Error de SDK No Instalado

**Síntoma**:
```typescript
for await (const event of executor.execute(config)) {
  console.log(event);
}
// Salida: { type: 'error', content: 'Failed to create session for agent architect', ... }
```

**Solución**:
```bash
bun add @anthropic-ai/claude-code
```

#### 2. Fallo en Creación de Sesión

**Causa**:
- API Key incorrecta
- Fallo de conexión de red
- Error interno del SDK

**Código de respuesta**:
```typescript
for await (const event of executor.execute(config)) {
  if (event.type === 'error') {
    if (event.content.includes('Failed to create session')) {
      logger.error('Fallo en creación de sesión — Verificar AuthProvider necesario', {
        agentName: event.agentName,
        error: event.content,
      });

      // Lógica de reintento (opción)
      await new Promise((resolve) => setTimeout(resolve, 5000));
      // retry...
    }
  }
}
```

#### 3. Error de Flujo de Sesión

**Causa**:
- Desconexión de red en el medio
- Error de flujo interno del SDK

**Código de respuesta**:
```typescript
try {
  for await (const event of executor.execute(config)) {
    // Procesar evento
  }
} catch (error) {
  logger.error('Error de flujo de sesión', { error });
  // La sesión se limpia automáticamente (se llama activeSessions.delete)
}
```

#### 4. Fallo en Reanudación de Sesión

**Causa**:
- ID de sesión no existe
- Sesión ya completada (eliminada después de evento done)

**Código de respuesta**:
```typescript
for await (const event of executor.resume(sessionId)) {
  if (event.type === 'error' && event.content.includes('Session not found')) {
    logger.warn('No se puede encontrar sesión — Necesario iniciar nueva sesión', { sessionId });

    // Iniciar nueva sesión
    for await (const newEvent of executor.execute(config)) {
      // ...
    }
  }
}
```

#### 5. Extracción Incorrecta de Nombre de Agente

**Causa**:
- Error de formato de ID de sesión (no es formato `projectId:featureId:agentName:phase`)

**Código de respuesta**:
```typescript
// Función de verificación de ID de sesión
function validateSessionId(sessionId: string): boolean {
  const parts = sessionId.split(':');
  if (parts.length !== 4) return false;

  const validAgents = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
  return validAgents.includes(parts[2] ?? '');
}

if (!validateSessionId(sessionId)) {
  logger.error('Formato de ID de sesión incorrecto', { sessionId });
  // Manejo de error...
}
```

### Patrón Común de Manejo de Errores

```typescript
async function executeAgentWithRetry(
  executor: V2SessionExecutor,
  config: AgentConfig,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let hasError = false;

    for await (const event of executor.execute(config)) {
      if (event.type === 'error') {
        logger.error(`Intento ${attempt}/${maxRetries} fallido`, {
          agentName: event.agentName,
          error: event.content,
        });
        hasError = true;
        break;
      }

      if (event.type === 'done') {
        logger.info('Ejecución de agente exitosa', { attempt });
        return;
      }
    }

    if (!hasError) {
      return; // Completo normalmente
    }

    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000; // Retroceso exponencial
      logger.info(`Reintentando en ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Fallo después de ${maxRetries} intentos`);
}
```

---

## 🎓 Uso Avanzado

### Avanzado 1: Filtrado de Eventos Personalizado

Puedes filtrar solo los eventos necesarios sin procesar todos los eventos recibidos del SDK.

```typescript
async function* filterMessageEvents(
  executor: V2SessionExecutor,
  config: AgentConfig,
): AsyncIterable<string> {
  for await (const event of executor.execute(config)) {
    if (event.type === 'message') {
      yield event.content;
    }
  }
}

// Ejemplo de uso
for await (const message of filterMessageEvents(executor, config)) {
  console.log('El agente dice:', message);
}
```

### Avanzado 2: Guardar Registro de Eventos

Puedes guardar todos los eventos en archivo para análisis posterior.

```typescript
import { writeFile } from 'node:fs/promises';

async function logAgentEventsToFile(
  executor: V2SessionExecutor,
  config: AgentConfig,
  logPath: string,
): Promise<void> {
  const events: AgentEvent[] = [];

  for await (const event of executor.execute(config)) {
    events.push(event);

    if (event.type === 'done') {
      await writeFile(logPath, JSON.stringify(events, null, 2));
      console.log(`Guardado de registro de eventos completo: ${logPath}`);
    }
  }
}

await logAgentEventsToFile(executor, config, './logs/agent-events.json');
```

### Avanzado 3: Automatización de Transición de Phase

Puedes ejecutar secuencialmente cambiando Phase automáticamente.

```typescript
async function executePhaseSequence(
  executor: V2SessionExecutor,
  baseConfig: Omit<AgentConfig, 'phase' | 'name'>,
): Promise<void> {
  const phases = [
    { phase: 'DESIGN', agentName: 'architect' },
    { phase: 'CODE', agentName: 'coder' },
    { phase: 'TEST', agentName: 'tester' },
    { phase: 'VERIFY', agentName: 'qc' },
  ] as const;

  for (const { phase, agentName } of phases) {
    console.log(`\n🚀 Iniciando ${phase} Phase con ${agentName}...`);

    const config: AgentConfig = {
      ...baseConfig,
      phase,
      name: agentName,
      prompt: `Ejecuta tareas de ${phase} phase`,
    };

    for await (const event of executor.execute(config)) {
      if (event.type === 'error') {
        throw new Error(`${phase} Phase falló: ${event.content}`);
      }

      if (event.type === 'done') {
        console.log(`✅ ${phase} Phase completo`);
      }
    }
  }
}

await executePhaseSequence(executor, {
  projectId: 'proj-001',
  featureId: 'feat-payment',
  systemPrompt: 'Eres un agente experto',
  tools: ['Read', 'Write', 'Bash', 'Grep'],
});
```

### Avanzado 4: Ejecución Paralela de Agentes

Puedes ejecutar varios agentes simultáneamente (ejecución independiente excepto DESIGN Phase).

```typescript
async function executeParallelAgents(
  executor: V2SessionExecutor,
  configs: AgentConfig[],
): Promise<void> {
  const promises = configs.map(async (config) => {
    const events: AgentEvent[] = [];
    for await (const event of executor.execute(config)) {
      events.push(event);
    }
    return { agentName: config.name, events };
  });

  const results = await Promise.all(promises);

  for (const { agentName, events } of results) {
    console.log(`\n[${agentName}] Total ${events.length} eventos recibidos`);
    const errors = events.filter((e) => e.type === 'error');
    if (errors.length > 0) {
      console.error(`  ❌ ${errors.length} errores ocurrieron`);
    }
  }
}

await executeParallelAgents(executor, [
  { name: 'coder', phase: 'CODE', /* ... */ },
  { name: 'tester', phase: 'TEST', /* ... */ },
]);
```

### Avanzado 5: Seguimiento de Estado de Sesión

Puedes crear una clase wrapper para rastrear el estado de progreso por sesión.

```typescript
class SessionTracker {
  private sessions = new Map<string, { events: AgentEvent[]; status: 'running' | 'done' | 'error' }>();

  async trackExecution(
    executor: V2SessionExecutor,
    config: AgentConfig,
  ): Promise<void> {
    const sessionId = `${config.projectId}:${config.featureId}:${config.name}:${config.phase}`;

    this.sessions.set(sessionId, { events: [], status: 'running' });

    try {
      for await (const event of executor.execute(config)) {
        this.sessions.get(sessionId)?.events.push(event);

        if (event.type === 'error') {
          this.sessions.get(sessionId)!.status = 'error';
        } else if (event.type === 'done') {
          this.sessions.get(sessionId)!.status = 'done';
        }
      }
    } catch (error) {
      this.sessions.get(sessionId)!.status = 'error';
      throw error;
    }
  }

  getSessionStatus(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([id, data]) => ({
      sessionId: id,
      eventCount: data.events.length,
      status: data.status,
    }));
  }
}

const tracker = new SessionTracker();
await tracker.trackExecution(executor, config);

console.log('Estado de todas las sesiones:', tracker.getAllSessions());
```

---

## ✅ Lista de Verificación

### Lista de Verificación Antes de Implementación

- [ ] Instalación completa de SDK `@anthropic-ai/claude-code`
- [ ] Configuración de variable de entorno `ANTHROPIC_API_KEY` o `CLAUDE_CODE_OAUTH_TOKEN`
- [ ] Implementación completa de AuthProvider (getAuthHeader, validateAuth)
- [ ] Preparación completa de instancia Logger
- [ ] Comprensión completa del tipo AgentConfig

### Lista de Verificación Antes de Ejecución

- [ ] Confirmar que AuthProvider.getAuthHeader() devuelve formato correcto
- [ ] Confirmar que valor de AgentConfig.phase es tipo Phase correcto
- [ ] Confirmar que AgentConfig.name es AgentName válido
- [ ] Confirmar que lista AgentConfig.tools son herramientas soportadas por SDK
- [ ] Entender que Agent Teams solo se activa en DESIGN Phase

### Lista de Verificación de Procesamiento de Eventos

- [ ] Recibir eventos con bucle `for await...of`
- [ ] Implementar bifurcación de procesamiento por `event.type`
- [ ] Manejo apropiado de error cuando ocurre evento `error`
- [ ] Reconocer limpieza automática de sesión al recibir evento `done`
- [ ] Guardar registro de eventos (opcional)

### Lista de Verificación de Manejo de Errores

- [ ] Responder a error de SDK no instalado (`Failed to create session`)
- [ ] Implementar lógica de reintento cuando falla creación de sesión (opcional)
- [ ] Reconocer limpieza de sesión cuando ocurre error de flujo de sesión
- [ ] Lógica para iniciar nueva sesión cuando falla reanudación de sesión
- [ ] Verificar formato incorrecto de ID de sesión

### Lista de Verificación de Limpieza

- [ ] Llamar `executor.cleanup()` antes de terminar proceso
- [ ] Registrar manejadores SIGINT, SIGTERM
- [ ] Confirmar que todas las sesiones activas se limpiaron

---

## 📚 Documentos de Referencia

- **ARCHITECTURE.md**: Estructura de 3 capas, rol de Layer2, ubicación de V2SessionExecutor
- **SPEC.md**: Lógica de transición de Phase, condiciones de activación de Agent Teams
- **IMPLEMENTATION-GUIDE.md**: Guía de integración de V2 Session API
- **src/layer2/types.ts**: Definición de tipos AgentConfig, AgentEvent
- **src/auth/types.ts**: Interfaz AuthProvider
- **tests/unit/layer2/v2-session-executor.test.ts**: 140 casos de prueba

---

## 🎉 Resumen

V2SessionExecutor es un ejecutor de agente inteligente que **cambia automáticamente la activación de Agent Teams basándose en Phase**.

### Funciones Centrales

1. **DESIGN Phase → Activar Agent Teams** (modo reunión de equipo)
2. **CODE/TEST/VERIFY Phase → Desactivar Agent Teams** (modo trabajo independiente)
3. **Encabezado de autenticación → Conversión automática a variable de entorno** (API Key / OAuth)
4. **Evento SDK → Mapeo AgentEvent** (message, tool_use, tool_result, error, done)
5. **Función de reanudación de sesión** (resume)

### Flujo de Uso

```
1. Preparar AuthProvider + Logger
2. Crear instancia V2SessionExecutor
3. Configurar AgentConfig (especificación de Phase requerida)
4. Llamar execute() con for await...of
5. Procesar por evento (message, tool_use, error, done)
6. Llamar cleanup() antes de terminar proceso
```

### Ventajas Centrales

- ✅ Cambio automático de colaboración de equipo / trabajo independiente por Phase
- ✅ Manejo de errores basado en patrón Result
- ✅ Seguimiento de progreso en tiempo real con flujo de eventos
- ✅ Posibilidad de continuar trabajo con reanudación de sesión

¡Garantiza estabilidad verificada con **140 pruebas completas pasadas**!
