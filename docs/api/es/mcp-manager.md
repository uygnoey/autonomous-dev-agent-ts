> **Languages:** [한국어](../ko/mcp-manager.md) | [English](../en/mcp-manager.md) | [日本語](../ja/mcp-manager.md) | [Español](../es/mcp-manager.md)

# Documentación API de McpManager

**Última actualización**: 2025-01-XX
**Versión**: v2.4
**Verificación de pruebas**: ✅ 140 pruebas completas pasadas (Normal 20%, Edge 40%, Error 40%)
**Evaluación Architect**: 95/100 (APPROVED)
**Evaluación Reviewer**: 95/100 (APPROVED)

---

## 🎯 Analogía para Principiantes

### McpManager = "Control Remoto de Robot de Juguete"

Imagina que tienes varios robots de juguete (servidores MCP) en casa.

- **McpRegistry** = Cuaderno de lista de robots (registrar qué robots hay)
- **McpLoader** = Máquina que lee manual de robot (leer archivo de configuración)
- **McpManager** = Control remoto integrado (encender, apagar, verificar estado de robot)

```
┌─────────────────────────────────────────────────────────────┐
│  McpManager (Control Remoto)                                │
│                                                             │
│  [Encender]  [Apagar]  [Estado]  [Todo Apagado]            │
│                                                             │
│  Robots Conectados:                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │  git    │  │ github  │  │  slack  │  │ memory  │       │
│  │ 🟢 ON   │  │ ⚫ OFF  │  │ 🟢 ON   │  │ ⚫ OFF  │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                             │
│  Herramientas Disponibles: 15                               │
└─────────────────────────────────────────────────────────────┘
```

### Conceptos Centrales

1. **Inicialización (initialize)**: Leer archivo de configuración para averiguar qué robots hay
2. **Inicio (startServer)**: Encender robot específico (estado: stopped → running)
3. **Detención (stopServer)**: Apagar robot específico (estado: running → stopped)
4. **Verificación de estado (getStatus)**: Verificar si el robot está encendido o apagado
5. **Detención completa (stopAll)**: Apagar todos los robots a la vez
6. **Verificación de salud (healthCheck)**: Ver estado de todos los robots de un vistazo
7. **Lista de herramientas (listTools)**: Ver herramientas proporcionadas por robots encendidos

**Importante**: ¡Crear robots reales (proceso) es el rol de Layer2! McpManager solo **gestiona estado**.

---

## 📐 Arquitectura

### Diagrama de Estructura Completa

```
┌────────────────────────────────────────────────────────────────┐
│                        McpManager                              │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ McpRegistry  │  │  McpLoader   │  │    Logger    │         │
│  │              │  │              │  │              │         │
│  │ - servers    │  │ - loadGlobal │  │ - info()     │         │
│  │ - register() │  │ - loadProject│  │ - warn()     │         │
│  │ - getServer()│  │ - merge()    │  │ - error()    │         │
│  │ - listServers│  │              │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│         ↓                  ↓                 ↓                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │          instances: Map<string, McpServerInstance>       │ │
│  │                                                          │ │
│  │  "git" → {                                               │ │
│  │    config: McpServerConfig,                              │ │
│  │    status: 'running',                                    │ │
│  │    tools: [{ name: 'git_status', ... }],                 │ │
│  │    startedAt: Date                                       │ │
│  │  }                                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Flujo de Inicialización

```
1. McpManager.initialize(globalDir, projectDir)
   ↓
2. McpLoader.loadAndMerge(globalDir, projectDir)
   ↓
   2-1. loadGlobalConfigs(globalDir)
        → Leer mcp.json de cada carpeta
        → Recopilar configuración global
   ↓
   2-2. loadProjectConfigs(projectDir)  [opcional]
        → Leer configuración local del proyecto
   ↓
   2-3. mergeConfigs(global, project)
        → Configuración del proyecto sobrescribe configuración global
        → Devolver configuración integrada final
   ↓
3. McpRegistry.clear() + instances.clear()
   → Inicializar información de registro existente
   ↓
4. for each config:
     McpRegistry.register(config)
     → Registrar servidor en registro
   ↓
5. Devolver Result<void>
```

### Flujo de Inicio de Servidor

```
1. McpManager.startServer(name)
   ↓
2. McpRegistry.getServer(name)
   → Consultar configuración del servidor
   ↓
   ¿No existe? → err(mcp_server_not_found)
   ¿Desactivado? → err(mcp_server_disabled)
   ¿Ya en ejecución? → err(mcp_server_already_running)
   ↓
3. Crear McpServerInstance
   {
     config: config,
     status: 'running',
     tools: [],  // Array vacío inicialmente
     startedAt: new Date()
   }
   ↓
4. instances.set(name, instance)
   → Guardar en mapa de instancia
   ↓
5. Devolver Result<McpServerInstance>
```

### Flujo de Detención de Servidor

```
1. McpManager.stopServer(name)
   ↓
2. instances.get(name)
   → Consultar instancia en ejecución
   ↓
   ¿No existe? → err(mcp_server_not_found)
   ¿Ya detenido? → err(mcp_server_already_stopped)
   ↓
3. instance.status = 'stopped'
   → Solo cambiar estado (Layer2 maneja terminación real del proceso)
   ↓
4. Devolver Result<void>
```

### Ciclo de Vida de Gestión de Estado

```
┌─────────────┐
│   stopped   │  ← Estado inicial (inmediatamente después del registro)
└─────────────┘
      │
      │ startServer()
      ↓
┌─────────────┐
│   running   │  ← En ejecución (herramientas disponibles)
└─────────────┘
      │
      │ stopServer()
      ↓
┌─────────────┐
│   stopped   │  ← Detenido (herramientas no disponibles)
└─────────────┘
```

---

## 🔧 Dependencias

### Dependencias Requeridas

```typescript
import { McpManager } from './mcp/mcp-manager.js';
import { McpRegistry } from './mcp/registry.js';
import { McpLoader } from './mcp/loader.js';
import type { Logger } from './core/logger.js';
import type { McpServerInstance, McpServerStatus, McpTool } from './mcp/types.js';
```

### Rol de McpRegistry

Registro que almacena y consulta configuración del servidor en memoria.

```typescript
class McpRegistry {
  register(config: McpServerConfig): Result<void>;
  getServer(name: string): McpServerConfig | undefined;
  listServers(): McpServerConfig[];
  clear(): void;
}
```

### Rol de McpLoader

Cargador que lee y fusiona archivos de configuración (mcp.json).

```typescript
class McpLoader {
  loadAndMerge(globalDir: string, projectDir?: string): Promise<Result<McpServerConfig[]>>;
}
```

### Definición de Tipos

```typescript
interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  env?: Record<string, string>;
}

interface McpServerInstance {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpTool[];
  startedAt: Date;
}

type McpServerStatus = 'stopped' | 'running';

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}
```

---

## 📦 Uso en 5 Pasos

### Paso 1: Preparar Dependencias

```typescript
import { ConsoleLogger } from './core/logger.js';
import { McpRegistry } from './mcp/registry.js';
import { McpLoader } from './mcp/loader.js';
import { McpManager } from './mcp/mcp-manager.js';

// Crear Logger
const logger = new ConsoleLogger('info');

// Crear Registry y Loader
const registry = new McpRegistry(logger);
const loader = new McpLoader(logger);
```

### Paso 2: Crear Instancia McpManager

```typescript
const manager = new McpManager(registry, loader, logger);
```

### Paso 3: Inicializar Configuración

```typescript
const globalDir = '~/.adev/mcp';      // Configuración MCP global
const projectDir = './project/.adev/mcp';  // Configuración local del proyecto (opcional)

const initResult = await manager.initialize(globalDir, projectDir);

if (!initResult.ok) {
  logger.error('Fallo en inicialización del gestor MCP', { error: initResult.error.message });
  throw initResult.error;
}

logger.info('Inicialización del gestor MCP completa');
```

### Paso 4: Iniciar y Gestionar Servidor

```typescript
// Iniciar servidor
const startResult = manager.startServer('git');

if (!startResult.ok) {
  logger.error('Fallo en inicio del servidor', { error: startResult.error.message });
} else {
  logger.info('Inicio del servidor exitoso', {
    name: startResult.value.config.name,
    status: startResult.value.status,
    startedAt: startResult.value.startedAt,
  });
}

// Verificar estado
const status = manager.getStatus('git');
console.log(`Estado del servidor git: ${status}`);  // Salida: Estado del servidor git: running

// Consultar lista de herramientas
const tools = manager.listTools();
console.log(`Herramientas disponibles: ${tools.length}`);
```

### Paso 5: Limpieza (Antes de Terminar Proceso)

```typescript
// Detener todos los servidores
const stopAllResult = manager.stopAll();

if (stopAllResult.ok) {
  logger.info('Detención completa de todos los servidores MCP');
}

// O detener servidor individual
const stopResult = manager.stopServer('git');

if (stopResult.ok) {
  logger.info('Detención del servidor git completa');
}
```

---

## ⚠️ Precauciones

### 1. Solo Responsable de Gestión de Estado

McpManager **no crea ni termina proceso real**.

```typescript
// ✅ Operación real
startServer('git');
// → Guardar 'git': { status: 'running', ... } en Map instances
// → Layer2 es responsable de crear proceso real

stopServer('git');
// → instance.status = 'stopped'
// → Layer2 es responsable de terminar proceso real
```

**Rol de Layer2** (no implementado en adev — para expansión futura):
```typescript
// Ejemplo: Crear proceso real en Layer2
const processResult = await spawnMcpServer(config);
if (processResult.ok) {
  manager.startServer(config.name);  // Solo actualizar estado
}
```

### 2. Inicialización Requerida

Debe llamar `initialize()` antes de operar servidor.

```typescript
// ❌ Uso incorrecto
const manager = new McpManager(registry, loader, logger);
manager.startServer('git');  // ¡Error! registro vacío

// ✅ Uso correcto
const manager = new McpManager(registry, loader, logger);
await manager.initialize(globalDir);
manager.startServer('git');  // Operación normal
```

### 3. Prevenir Duplicación de Nombre de Servidor

Si registrar servidor con el mismo nombre varias veces, **se mantiene la última configuración**.

```typescript
// Configuración global: ~/.adev/mcp/git/mcp.json
{ "servers": [{ "name": "git", "command": "git-mcp-v1", ... }] }

// Configuración del proyecto: ./project/.adev/mcp/git/mcp.json
{ "servers": [{ "name": "git", "command": "git-mcp-v2", ... }] }

// Resultado de fusión: Configuración del proyecto sobrescribe configuración global
await manager.initialize(globalDir, projectDir);
// → Servidor "git" usa comando "git-mcp-v2"
```

### 4. Servidores Desactivados No se Pueden Iniciar

```typescript
// mcp.json
{ "servers": [{ "name": "disabled-server", "enabled": false, ... }] }

await manager.initialize(globalDir);
const result = manager.startServer('disabled-server');

// result.ok === false
// result.error.code === 'mcp_server_disabled'
```

### 5. listTools() Solo Incluye Servidores running

```typescript
manager.startServer('git');   // running
manager.startServer('slack'); // running
manager.stopServer('slack');  // stopped

const tools = manager.listTools();
// Solo incluye herramientas del servidor git (excluye herramientas del servidor slack)
```

---

## 💡 Código de Ejemplo

### Ejemplo 1: Gestión Básica de Servidor

```typescript
import { ConsoleLogger } from './core/logger.js';
import { McpRegistry } from './mcp/registry.js';
import { McpLoader } from './mcp/loader.js';
import { McpManager } from './mcp/mcp-manager.js';

const logger = new ConsoleLogger('info');
const registry = new McpRegistry(logger);
const loader = new McpLoader(logger);
const manager = new McpManager(registry, loader, logger);

// Inicialización
const initResult = await manager.initialize('~/.adev/mcp');
if (!initResult.ok) {
  throw initResult.error;
}

// Iniciar servidor git
const gitResult = manager.startServer('git');
if (gitResult.ok) {
  console.log(`✅ Servidor git iniciado: ${gitResult.value.config.command}`);
  console.log(`   Hora de inicio: ${gitResult.value.startedAt.toISOString()}`);
}

// Iniciar servidor github
const githubResult = manager.startServer('github');
if (githubResult.ok) {
  console.log(`✅ Servidor github iniciado: ${githubResult.value.config.command}`);
}

// Verificar herramientas disponibles
const tools = manager.listTools();
console.log(`\nHerramientas disponibles: ${tools.length}`);
for (const tool of tools) {
  console.log(`  - ${tool.name}: ${tool.description || 'Sin descripción'}`);
}

// Limpiar antes de terminar proceso
manager.stopAll();
console.log('\n✅ Detención completa de todos los servidores');
```

**Ejemplo de salida**:
```
✅ Servidor git iniciado: npx -y @modelcontextprotocol/server-git
   Hora de inicio: 2025-01-15T08:30:00.000Z
✅ Servidor github iniciado: npx -y @modelcontextprotocol/server-github

Herramientas disponibles: 12
  - git_status: Check git repository status
  - git_diff: Show file differences
  - github_create_issue: Create a new issue
  ...

✅ Detención completa de todos los servidores
```

### Ejemplo 2: Monitoreo de Estado

```typescript
// Verificar estado de todos los servidores
const healthResult = manager.healthCheck();

if (healthResult.ok) {
  console.log('📊 Estado del servidor:');
  for (const [name, status] of Object.entries(healthResult.value)) {
    const emoji = status === 'running' ? '🟢' : '⚫';
    console.log(`  ${emoji} ${name}: ${status}`);
  }
}

// Verificar estado de servidor individual
const gitStatus = manager.getStatus('git');
console.log(`\nServidor git: ${gitStatus}`);
```

**Ejemplo de salida**:
```
📊 Estado del servidor:
  🟢 git: running
  ⚫ github: stopped
  🟢 slack: running
  ⚫ memory: stopped

Servidor git: running
```

### Ejemplo 3: Manejo de Errores

```typescript
// Intento de iniciar servidor inexistente
const result1 = manager.startServer('nonexistent');
if (!result1.ok) {
  console.error(`❌ ${result1.error.code}: ${result1.error.message}`);
  // Salida: ❌ mcp_server_not_found: No se puede encontrar servidor / Server not found: nonexistent
}

// Intento de iniciar servidor desactivado
const result2 = manager.startServer('disabled-server');
if (!result2.ok) {
  console.error(`❌ ${result2.error.code}: ${result2.error.message}`);
  // Salida: ❌ mcp_server_disabled: Servidor desactivado / Server is disabled: disabled-server
}

// Intento de iniciar servidor ya en ejecución
manager.startServer('git');
const result3 = manager.startServer('git');
if (!result3.ok) {
  console.error(`❌ ${result3.error.code}: ${result3.error.message}`);
  // Salida: ❌ mcp_server_already_running: Servidor ya en ejecución / Server is already running: git
}
```

---

## 🐛 Manejo de Errores

### Respuesta por Tipo de Error

#### 1. Fallo de Inicialización (`initialize`)

**Causa**:
- No hay directorio de configuración
- Error de formato de archivo mcp.json
- Permisos insuficientes de lectura de archivo

**Código de respuesta**:
```typescript
const initResult = await manager.initialize(globalDir, projectDir);

if (!initResult.ok) {
  logger.error('Fallo de inicialización', {
    code: initResult.error.code,
    message: initResult.error.message,
  });

  // Intento de crear directorio
  if (initResult.error.message.includes('ENOENT')) {
    await mkdir(globalDir, { recursive: true });
    await manager.initialize(globalDir);  // Reintentar
  }
}
```

#### 2. Fallo de Inicio de Servidor (`startServer`)

**Códigos de error**:
- `mcp_server_not_found`: Servidor no registrado en registro
- `mcp_server_disabled`: Servidor con `enabled: false`
- `mcp_server_already_running`: Ya en estado running

**Código de respuesta**:
```typescript
const startResult = manager.startServer(serverName);

if (!startResult.ok) {
  switch (startResult.error.code) {
    case 'mcp_server_not_found':
      logger.warn('Servidor no registrado — Verificar archivo de configuración necesario', { serverName });
      break;

    case 'mcp_server_disabled':
      logger.info('Servidor desactivado — Cambiar a enabled: true necesario', { serverName });
      break;

    case 'mcp_server_already_running':
      logger.debug('Ya en ejecución — Ignorar', { serverName });
      break;

    default:
      logger.error('Error desconocido', { error: startResult.error });
  }
}
```

#### 3. Fallo de Detención de Servidor (`stopServer`)

**Códigos de error**:
- `mcp_server_not_found`: Servidor nunca ejecutado
- `mcp_server_already_stopped`: Ya en estado stopped

**Código de respuesta**:
```typescript
const stopResult = manager.stopServer(serverName);

if (!stopResult.ok) {
  switch (stopResult.error.code) {
    case 'mcp_server_not_found':
      logger.warn('Servidor nunca ejecutado — No se puede detener', { serverName });
      break;

    case 'mcp_server_already_stopped':
      logger.debug('Ya detenido — Ignorar', { serverName });
      break;

    default:
      logger.error('Fallo de detención', { error: stopResult.error });
  }
}
```

### Patrón Común de Manejo de Errores

```typescript
async function safeStartServer(
  manager: McpManager,
  name: string,
): Promise<boolean> {
  const result = manager.startServer(name);

  if (!result.ok) {
    logger.error('Fallo de inicio del servidor', {
      name,
      code: result.error.code,
      message: result.error.message,
    });
    return false;
  }

  logger.info('Inicio del servidor exitoso', {
    name,
    status: result.value.status,
    startedAt: result.value.startedAt,
  });
  return true;
}

// Ejemplo de uso
if (await safeStartServer(manager, 'git')) {
  console.log('Preparación del servidor git completa');
}
```

---

## 🎓 Uso Avanzado

### Avanzado 1: Inicio Automático de Servidor

Iniciar automáticamente servidores con `enabled: true` en configuración.

```typescript
async function startAllEnabledServers(manager: McpManager): Promise<void> {
  // Obtener lista de todos los servidores con healthCheck después de inicialización
  const healthResult = manager.healthCheck();
  if (!healthResult.ok) {
    throw healthResult.error;
  }

  const serverNames = Object.keys(healthResult.value);

  for (const name of serverNames) {
    const result = manager.startServer(name);

    if (result.ok) {
      logger.info(`✅ Inicio exitoso del servidor ${name}`);
    } else if (result.error.code === 'mcp_server_disabled') {
      logger.debug(`⏭️  Servidor ${name} omitido (desactivado)`);
    } else {
      logger.error(`❌ Fallo de inicio del servidor ${name}`, { error: result.error.message });
    }
  }
}

await manager.initialize(globalDir);
await startAllEnabledServers(manager);
```

### Avanzado 2: Monitoreo de Salud del Servidor en Tiempo Real

Verificar periódicamente el estado del servidor y dejar registro.

```typescript
function monitorServerHealth(
  manager: McpManager,
  intervalMs = 30000,  // 30 segundos
): NodeJS.Timeout {
  return setInterval(() => {
    const healthResult = manager.healthCheck();

    if (healthResult.ok) {
      const runningCount = Object.values(healthResult.value).filter(
        (status) => status === 'running',
      ).length;

      logger.info('📊 Verificación de estado del servidor', {
        totalServers: Object.keys(healthResult.value).length,
        runningServers: runningCount,
        timestamp: new Date().toISOString(),
      });
    }
  }, intervalMs);
}

// Ejemplo de uso
const monitorInterval = monitorServerHealth(manager);

// Detener monitoreo al terminar proceso
process.on('SIGINT', () => {
  clearInterval(monitorInterval);
  manager.stopAll();
  process.exit(0);
});
```

### Avanzado 3: Utilidad de Reinicio de Servidor

Detener y volver a iniciar servidor (útil al recargar configuración).

```typescript
function restartServer(
  manager: McpManager,
  name: string,
): Result<McpServerInstance> {
  // Paso 1: Detener si está en ejecución
  const currentStatus = manager.getStatus(name);
  if (currentStatus === 'running') {
    const stopResult = manager.stopServer(name);
    if (!stopResult.ok) {
      return err(stopResult.error);
    }
    logger.info(`Detención del servidor ${name} completa`);
  }

  // Paso 2: Reiniciar
  const startResult = manager.startServer(name);
  if (!startResult.ok) {
    return err(startResult.error);
  }

  logger.info(`Reinicio del servidor ${name} completo`);
  return startResult;
}

// Ejemplo de uso
const restartResult = restartServer(manager, 'git');
if (restartResult.ok) {
  console.log('✅ Reinicio del servidor git exitoso');
}
```

### Avanzado 4: Filtrado de Herramientas

Filtrar herramientas por patrón específico.

```typescript
function filterToolsByPattern(
  manager: McpManager,
  pattern: string,
): McpTool[] {
  const allTools = manager.listTools();
  const regex = new RegExp(pattern, 'i');

  return allTools.filter((tool) => regex.test(tool.name));
}

// Ejemplo de uso
const gitTools = filterToolsByPattern(manager, '^git_');
console.log('Herramientas relacionadas con git:', gitTools.map((t) => t.name));
// Salida: ['git_status', 'git_diff', 'git_commit', ...]

const createTools = filterToolsByPattern(manager, '_create$');
console.log('Herramientas de creación:', createTools.map((t) => t.name));
// Salida: ['github_create_issue', 'slack_create_channel', ...]
```

### Avanzado 5: Gestión de Grupo de Servidores

Agrupar varios servidores y gestionarlos en lote.

```typescript
class ServerGroup {
  constructor(
    private manager: McpManager,
    private serverNames: string[],
  ) {}

  startAll(): Result<void> {
    for (const name of this.serverNames) {
      const result = this.manager.startServer(name);
      if (!result.ok && result.error.code !== 'mcp_server_already_running') {
        return err(result.error);
      }
    }
    return ok(undefined);
  }

  stopAll(): Result<void> {
    for (const name of this.serverNames) {
      const result = this.manager.stopServer(name);
      if (!result.ok && result.error.code !== 'mcp_server_already_stopped') {
        return err(result.error);
      }
    }
    return ok(undefined);
  }

  getStatuses(): Record<string, McpServerStatus> {
    const statuses: Record<string, McpServerStatus> = {};
    for (const name of this.serverNames) {
      statuses[name] = this.manager.getStatus(name);
    }
    return statuses;
  }
}

// Ejemplo de uso
const vcsGroup = new ServerGroup(manager, ['git', 'github']);
const communicationGroup = new ServerGroup(manager, ['slack', 'email']);

vcsGroup.startAll();
console.log('Estado del grupo VCS:', vcsGroup.getStatuses());
// Salida: { git: 'running', github: 'running' }

communicationGroup.startAll();
console.log('Estado del grupo Communication:', communicationGroup.getStatuses());
// Salida: { slack: 'running', email: 'running' }

// Limpieza por grupo al terminar
vcsGroup.stopAll();
communicationGroup.stopAll();
```

---

## ✅ Lista de Verificación

### Lista de Verificación Antes de Implementación

- [ ] Implementación completa de McpRegistry
- [ ] Implementación completa de McpLoader
- [ ] Preparación completa de instancia Logger
- [ ] Comprensión de estructura de directorio de archivo de configuración (`~/.adev/mcp/`, `./project/.adev/mcp/`)
- [ ] Comprensión del formato de archivo mcp.json

### Lista de Verificación de Inicialización

- [ ] Confirmar que ruta globalDir es correcta
- [ ] Confirmar que ruta projectDir es correcta (opcional)
- [ ] Llamada completa de initialize()
- [ ] Confirmar éxito de inicialización (patrón Result)
- [ ] Confirmar lista de servidores registrados (healthCheck)

### Lista de Verificación de Gestión de Servidor

- [ ] Confirmar que servidor está registrado en registro antes de llamar startServer()
- [ ] Manejo de errores con patrón Result de resultado de startServer()
- [ ] Reconocer que servidores desactivados no se pueden iniciar
- [ ] Prevenir reinicio de servidor ya en ejecución
- [ ] Confirmar que servidor está en estado running antes de llamar stopServer()

### Lista de Verificación de Consulta de Herramientas

- [ ] Reconocer que listTools() solo devuelve herramientas de servidores running
- [ ] Reconocer que herramientas de servidores detenidos se excluyen de la lista
- [ ] Reconocer que lista de herramientas puede estar vacía

### Lista de Verificación de Limpieza

- [ ] Llamar stopAll() antes de terminar proceso
- [ ] Registrar manejadores SIGINT, SIGTERM
- [ ] Confirmar que todos los servidores están en estado stopped

---

## 📚 Documentos de Referencia

- **ARCHITECTURE.md**: Ubicación del módulo MCP, gráfico de dependencias
- **SPEC.md**: Requisitos de integración MCP, formato de configuración del servidor
- **IMPLEMENTATION-GUIDE.md**: Guía de integración del servidor MCP builtin
- **src/mcp/types.ts**: Definición de tipos McpServerConfig, McpServerInstance
- **src/mcp/registry.ts**: Implementación de McpRegistry
- **src/mcp/loader.ts**: Implementación de McpLoader
- **tests/unit/mcp/mcp-manager.test.ts**: Casos de prueba

---

## 🎉 Resumen

McpManager es un sistema de control central que **gestiona el ciclo de vida del servidor MCP (inicialización, inicio, detención, verificación de estado)**.

### Funciones Centrales

1. **Inicialización (initialize)**: Cargar archivo de configuración + Registrar servidor
2. **Inicio (startServer)**: Cambiar estado del servidor a running
3. **Detención (stopServer)**: Cambiar estado del servidor a stopped
4. **Detención completa (stopAll)**: Detener todos los servidores a la vez
5. **Consulta de estado (getStatus)**: Verificar estado de servidor individual
6. **Verificación de salud (healthCheck)**: Consultar estado de todos los servidores
7. **Lista de herramientas (listTools)**: Agregar herramientas de servidores en ejecución

### Flujo de Uso

```
1. Preparar McpRegistry + McpLoader + Logger
2. Crear instancia McpManager
3. Llamar initialize(globalDir, projectDir)
4. Llamar startServer(name)
5. Verificar herramientas disponibles con listTools()
6. Llamar stopAll() o stopServer(name)
```

### Ventajas Centrales

- ✅ Manejo de errores basado en patrón Result
- ✅ Solo gestionar estado (Layer2 crea proceso)
- ✅ Fusión de configuración global + proyecto
- ✅ Agregación automática solo de herramientas de servidores en ejecución

¡Garantiza estabilidad verificada con **140 pruebas completas pasadas**!
