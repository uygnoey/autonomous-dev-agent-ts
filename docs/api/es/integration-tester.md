> **Languages:** [한국어](../ko/integration-tester.md) | [English](../en/integration-tester.md) | [日本語](../ja/integration-tester.md) | [Español](../es/integration-tester.md)

# IntegrationTester — Ejecutor de Pruebas de Integración

## 🎯 ¿Qué es esto?

**Analogía para principiantes:**
IntegrationTester es como un "juego de subir escaleras"

Subiendo un edificio de 4 pisos:
- **Piso 1 (Unit)**: Prueba por funcionalidad → ¡Si pasa, sube al piso 2!
- **Piso 2 (Module)**: Prueba de funcionalidad relacionada → ¡Si pasa, sube al piso 3!
- **Piso 3 (Integration)**: Prueba simple de funcionalidad completa → ¡Si pasa, sube al piso 4!
- **Piso 4 (E2E)**: Prueba perfecta del sistema completo → ¡Si pasa, éxito! 🎉

**Regla importante:** ¡Si fallas en un solo piso, se acabó el juego! Debes empezar desde el principio.

Esto se llama "**Fail-Fast**". ¡Falla rápido y arregla rápido!

**Descripción técnica:**
Tester que ejecuta pruebas de integración de 4 pasos con principio Fail-Fast.
- Paso 1: Unit Tests (E2E por funcionalidad)
- Paso 2: Module Tests (regresión de funcionalidad relacionada)
- Paso 3: Integration Tests (smoke de funcionalidad no relacionada)
- Paso 4: E2E Tests (integración completa)
- Ejecuta `bun test` con ProcessExecutor
- Aislamiento de pruebas con CleanEnvManager
- Detención inmediata si falla 1

---

## 🔍 ¿Por qué es necesario?

### 1. Principio Fail-Fast
**Problema:** ¡Pérdida de tiempo si descubres el fallo después de ejecutar todas las pruebas!

**Solución:** Detención inmediata en el primer fallo → Arreglar inmediatamente → Desde el principio otra vez
```
❌ Método malo: Ejecutar durante 10 minutos y luego "Falló en el piso 1" → 10 minutos perdidos
✅ Método bueno: En 30 segundos "¡Fallo en piso 1!" → Arreglar inmediatamente → Resolver en 2 minutos
```

### 2. Aislamiento de Pruebas (Clean Environment)
Ejecutar cada prueba en un entorno limpio:
```typescript
// Prueba 1: Entorno limpio
await tester.runIntegrationTests('project-a', '/path/a');

// Prueba 2: Otro entorno limpio (0% de influencia de 1)
await tester.runIntegrationTests('project-b', '/path/b');
```

### 3. Verificación en Cascada de 4 Pasos
¿Por qué dividir en 4 pasos?
```
Piso 1 (Unit): Verificar si funciona la funcionalidad individual
   ↓
Piso 2 (Module): Verificar si funcionan bien las funcionalidades relacionadas
   ↓
Piso 3 (Integration): Verificar si funciona simplemente la funcionalidad completa
   ↓
Piso 4 (E2E): Verificar si funciona perfectamente como usuario real
```

Dividir en pasos:
- Puedes saber inmediatamente dónde ocurrió el problema
- Eficiente en orden de pruebas rápidas → lentas
- Puedes encontrar problemas en unidades pequeñas

---

## 📐 Arquitectura

### Diagrama de Flujo Fail-Fast (Juego de Subir Escaleras)

```
┌─────────────────┐
│ Inicio prueba   │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Piso 1: Unit Tests │
└────────┬────────┘
         ↓
     ¿Pasa? ───SÍ──→ ┌─────────────────┐
       │            │ Piso 2: Module Tests│
       NO           └────────┬────────┘
       ↓                     ↓
   ❌ Detención inmediata    ¿Pasa? ───SÍ──→ ┌──────────────────────┐
   (Fail-Fast)            │            │ Piso 3: Integration Tests│
                          NO           └────────┬─────────────┘
                          ↓                     ↓
                      ❌ Detención inmediata    ¿Pasa? ───SÍ──→ ┌─────────────────┐
                                            │            │ Piso 4: E2E Tests   │
                                            NO           └────────┬────────┘
                                            ↓                     ↓
                                        ❌ Detención inmediata    ¿Pasa? ───SÍ──→ ✅ ¡Éxito completo!
                                                              │
                                                              NO
                                                              ↓
                                                          ❌ Detención inmediata
```

### Mecanismo Interno

```
┌────────────────────────────────────────────┐
│ IntegrationTester                          │
├────────────────────────────────────────────┤
│ runIntegrationTests()                      │
│   ↓                                        │
│ CleanEnvManager.create() → Crear entorno aislado│
│   ↓                                        │
│ for each step (1~4):                       │
│   ↓                                        │
│   runStep() → ProcessExecutor              │
│   ↓                                        │
│   bun test {testPath}                      │
│   ↓                                        │
│   parseTestResult() → exitCode + stdout    │
│   ↓                                        │
│   ¿pasó? ───SÍ──→ Siguiente paso          │
│       │                                    │
│       NO ────→ ❌ break (Fail-Fast)        │
│                                            │
│ CleanEnvManager.destroy() → Limpiar entorno│
└────────────────────────────────────────────┘
```

### Punto de Mejora de Diseño (Insight del Architect)

**Diseño original:** Ejecutar agente tester con Agent Spawn
```typescript
// Método complejo
const testerAgent = await agentSpawner.spawn('tester', config);
await testerAgent.run();
```

**Implementación real:** Ejecutar `bun test` directamente con ProcessExecutor
```typescript
// Método simple
await processExecutor.execute('bun', ['test', 'tests/unit']);
```

**¿POR QUÉ mejoró?**
1. **Las pruebas de integración son solo "ejecución de comandos"** → ProcessExecutor es adecuado
2. **Agent Spawn es complejo** → Sobrecarga
3. **Solución más simple** → Más rápido y estable

**Lección:** ¡Siempre considera primero la solución más simple!

---

## 🔧 Dependencias

### Dependencias Directas
- `ProcessExecutor` (`src/core/process-executor.ts`) — Ejecutar `bun test`
- `CleanEnvManager` (`src/layer2/clean-env-manager.ts`) — Aislamiento de pruebas
- `Logger` (`src/core/logger.ts`) — Registro
- `Result` (`src/core/types.ts`) — Manejo de errores

### Gráfico de Dependencias
```
layer2/integration-tester
  ↓
┌─────────────┬─────────────────┬──────────────┐
│ ProcessExecutor │ CleanEnvManager │ core/logger  │
└─────────────┴─────────────────┴──────────────┘
        ↓
    core/types (Patrón Result)
```

**Regla:** layer2 solo puede depender de core, layer1, rag

---

## 📦 ¿Cómo se usa?

### Paso 1: Crear Instancia

```typescript
import { IntegrationTester } from '../layer2/integration-tester.js';
import { ProcessExecutor } from '../core/process-executor.js';
import { CleanEnvManager } from '../layer2/clean-env-manager.js';
import { Logger } from '../core/logger.js';

// 1. Crear logger
const logger = new Logger({ level: 'info' });

// 2. Crear ProcessExecutor
const processExecutor = new ProcessExecutor(logger);

// 3. Crear CleanEnvManager
const envManager = new CleanEnvManager(logger, '/tmp/clean-envs');

// 4. Crear IntegrationTester
const tester = new IntegrationTester(logger, processExecutor, envManager);
```

### Paso 2: Ejecutar Pruebas de Integración

```typescript
// Configurar ruta del proyecto
const projectId = 'my-awesome-project';
const projectPath = '/Users/you/projects/my-project';

// Ejecutar pruebas de integración
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  console.log('✅ Resultados de pruebas de integración:');
  results.forEach((stepResult) => {
    console.log(`Step ${stepResult.step}:`, stepResult.passed ? '✅ Pasa' : '❌ Falla');
    if (!stepResult.passed) {
      console.log(`   Número de fallos: ${stepResult.failCount}`);
    }
  });

  // ¿Pasaron todos los pasos?
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log('🎉 ¡Todos los pasos pasaron!');
  } else {
    console.log('❌ Algunos pasos fallaron. Por favor, corrige el código.');
  }
} else {
  console.error('Error en ejecución de pruebas:', result.error.message);
}
```

### Paso 3: Verificar Progreso en Tiempo Real

```typescript
// Verificar paso actual
const currentStep = tester.getCurrentStep();
console.log('Paso actual:', currentStep);

// Verificar resultados intermedios
const intermediateResults = tester.getResults();
console.log('Resultados hasta ahora:', intermediateResults);
```

### Paso 4: Verificar Comportamiento Fail-Fast

```typescript
// Si falla en piso 1, no se ejecutan los pisos 2-4
const result = await tester.runIntegrationTests('project', '/path');

if (result.ok) {
  const results = result.value;

  console.log('Número de pasos ejecutados:', results.length);
  // Si falla en piso 1 → Solo se ejecuta 1 (Fail-Fast)
  // Si todos pasan → Se ejecutan todos 4
}
```

### Paso 5: Estructura de Directorio de Pruebas

IntegrationTester busca pruebas en las siguientes rutas:
```
/path/to/project/
├── tests/
│   ├── unit/          ← Paso 1: Pruebas por funcionalidad
│   ├── module/        ← Paso 2: Pruebas de integración de módulos
│   ├── integration/   ← Paso 3: Pruebas de integración completa
│   └── e2e/           ← Paso 4: Pruebas End-to-End
```

Escribe archivos `.test.ts` en cada directorio:
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';

describe('Authentication', () => {
  it('Inicio de sesión exitoso', () => {
    // Código de prueba
    expect(result).toBe(true);
  });
});
```

---

## ⚠️ Puntos de Atención

### 1. Timeout de Prueba
**Timeout predeterminado: 5 minutos (300 segundos)**

Si hay pruebas E2E que tardan mucho, considera el timeout:
```typescript
// Actualmente fijo en 5 minutos
// Si es necesario, se puede agregar opción al crear IntegrationTester
```

**Método de evasión:**
- Dividir pruebas en partes más pequeñas
- Considerar ejecución paralela
- Eliminar tiempos de espera innecesarios

### 2. Entender Significado de Fail-Fast
**Fail-Fast no es "fallar rápido", sino "detener inmediatamente si falla":**

```typescript
// ❌ Comprensión incorrecta: Ejecutar todas las pruebas rápidamente
// ✅ Comprensión correcta: No ejecutar el resto si falla 1

const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  if (results.length < 4) {
    console.log('¡Fail-Fast activado! Solo se ejecutaron algunos pasos');
    console.log('Pasos ejecutados:', results.length);
  }
}
```

### 3. Limpieza Automática de Clean Environment
El entorno se limpia automáticamente después de completar las pruebas:
```typescript
// Antes de prueba: Crear entorno limpio
// Durante prueba: Usar entorno aislado
// Después de prueba: Eliminar entorno automáticamente (sin importar éxito/fallo)
```

**Atención:** ¡Los archivos creados durante la prueba se eliminan con el entorno!

### 4. Verificar Simultáneamente exitCode y failCount
Condición de paso de prueba:
```typescript
const passed = exitCode === 0 && failCount === 0;
```

**¿POR QUÉ verificar ambos?**
- `exitCode === 0`: Proceso terminó normalmente
- `failCount === 0`: No hay pruebas fallidas en realidad

¡Si alguno es false, se juzga como fallo!

---

## 💡 Código de Ejemplo

### Ejemplo 1: Análisis de Resultados por Paso

```typescript
/**
 * Salida de resultados detallados por cada paso
 */
async function analyzeStepByStep(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const result = await tester.runIntegrationTests(projectId, projectPath);

  if (!result.ok) {
    console.error('Error en ejecución de prueba:', result.error.message);
    return;
  }

  const results = result.value;

  console.log('=== Resultados Detallados de Pruebas de Integración ===\n');

  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  results.forEach((stepResult, idx) => {
    const name = stepNames[stepResult.step - 1];
    const icon = stepResult.passed ? '✅' : '❌';

    console.log(`${icon} Paso ${stepResult.step}: ${name}`);
    console.log(`   Estado: ${stepResult.passed ? 'Pasa' : 'Falla'}`);
    console.log(`   Número de fallos: ${stepResult.failCount}`);
    console.log('');
  });

  // Verificar si se activó Fail-Fast
  if (results.length < 4) {
    const failedStep = results.findIndex((r) => !r.passed) + 1;
    console.log(`⚠️ ¡Fail-Fast activado! Detenido en Paso ${failedStep}.`);
  } else if (results.every((r) => r.passed)) {
    console.log('🎉 ¡Todos los pasos pasaron! ¡Listo para despliegue!');
  }
}
```

### Ejemplo 2: Reintento Automático (Reiniciar después de Corregir Código si Falla)

```typescript
/**
 * Ofrecer oportunidad de corrección al usuario si falla y reintentar
 */
async function runWithRetry(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n=== Intento ${attempt}/${maxRetries} ===`);

    const result = await tester.runIntegrationTests(projectId, projectPath);

    if (!result.ok) {
      console.error('Error en ejecución de prueba:', result.error.message);
      continue;
    }

    const results = result.value;
    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      console.log('✅ ¡Todas las pruebas pasaron!');
      return true;
    }

    // Encontrar paso fallido
    const failedStep = results.find((r) => !r.passed);
    if (failedStep) {
      console.log(`❌ Paso ${failedStep.step} falló (${failedStep.failCount} casos)`);

      if (attempt < maxRetries) {
        console.log('\nPresiona Enter después de corregir el código para continuar...');
        // En realidad espera entrada del usuario con readline, etc.
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.log('❌ Número máximo de reintentos excedido');
  return false;
}
```

### Ejemplo 3: Visualización de Progreso en Tiempo Real

```typescript
/**
 * Mostrar progreso de prueba en tiempo real
 */
async function runWithProgress(
  tester: IntegrationTester,
  projectId: string,
  projectPath: string,
) {
  const stepNames = ['Unit', 'Module', 'Integration', 'E2E'];

  console.log('Iniciando pruebas de integración...\n');

  // Intervalo para mostrar progreso
  const progressInterval = setInterval(() => {
    const currentStep = tester.getCurrentStep();
    const results = tester.getResults();

    if (currentStep > 0) {
      const currentName = stepNames[currentStep - 1];
      console.log(`Ejecutando actualmente: Paso ${currentStep} (${currentName})...`);
    }

    results.forEach((result, idx) => {
      if (result.passed) {
        console.log(`✅ Paso ${result.step} completado`);
      }
    });
  }, 2000);

  const result = await tester.runIntegrationTests(projectId, projectPath);

  clearInterval(progressInterval);

  if (result.ok) {
    console.log('\n¡Pruebas completadas!');
  }
}
```

---

## 🐛 ¿Qué hacer si hay un error?

### Tipos de Códigos de Error

#### 1. Error de ProcessExecutor
**Causa:** Fallo al ejecutar comando `bun test`

**Solución:**
```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (!result.ok && result.error.code === 'process_execution_error') {
  console.error('Fallo en ejecución de bun test:');
  console.error('1. Verificar si Bun está instalado');
  console.error('2. Verificar si la ruta del proyecto es correcta');
  console.error('3. Verificar si existe el directorio tests/');

  // Verificar ruta
  console.log('Ruta del proyecto:', projectPath);
}
```

#### 2. Error de CleanEnvManager
**Causa:** Fallo al crear/eliminar entorno aislado

**Solución:**
```typescript
if (!result.ok && result.error.code === 'env_creation_failed') {
  console.error('Fallo al crear entorno limpio:');
  console.error('1. Verificar permisos de escritura en directorio /tmp');
  console.error('2. Verificar espacio en disco');
  console.error('3. Limpiar entornos anteriores (rm -rf /tmp/clean-envs)');
}
```

#### 3. Timeout de Prueba
**Causa:** Pruebas no completadas dentro de 5 minutos

**Solución:**
```typescript
// Actualmente fijo en 5 minutos, por lo que se deben optimizar las pruebas
console.error('Timeout de prueba:');
console.error('1. Identificar pruebas lentas (bun test --bail)');
console.error('2. Considerar ejecución paralela');
console.error('3. Eliminar tiempos de espera innecesarios');
```

### Manejo de Fallos por Paso

```typescript
const result = await tester.runIntegrationTests(projectId, projectPath);

if (result.ok) {
  const results = result.value;

  // Analizar causa de fallo por cada paso
  results.forEach((stepResult) => {
    if (!stepResult.passed) {
      console.error(`\n❌ Análisis de fallo Paso ${stepResult.step}:`);

      switch (stepResult.step) {
        case 1:
          console.error('Fallo en Unit Tests:');
          console.error('→ Hay problema en funciones o clases individuales.');
          console.error('→ Verificar pruebas en directorio tests/unit/.');
          break;

        case 2:
          console.error('Fallo en Module Tests:');
          console.error('→ Hay problema en integración entre módulos.');
          console.error('→ Verificar pruebas en directorio tests/module/.');
          break;

        case 3:
          console.error('Fallo en Integration Tests:');
          console.error('→ Hay problema en integración del sistema completo.');
          console.error('→ Verificar pruebas en directorio tests/integration/.');
          break;

        case 4:
          console.error('Fallo en E2E Tests:');
          console.error('→ Hay problema en escenario de usuario real.');
          console.error('→ Verificar pruebas en directorio tests/e2e/.');
          break;
      }

      console.error(`Número de pruebas fallidas: ${stepResult.failCount}`);
    }
  });
}
```

---

## 📊 Referencia de API

### Clase `IntegrationTester`

#### Constructor
```typescript
constructor(
  logger: Logger,
  processExecutor: ProcessExecutor,
  envManager: CleanEnvManager,
)
```

**Parámetros:**
- `logger`: Instancia de Logger
- `processExecutor`: Instancia de ProcessExecutor (para ejecutar `bun test`)
- `envManager`: Instancia de CleanEnvManager (para aislamiento de pruebas)

---

#### Método `runIntegrationTests()`
```typescript
async runIntegrationTests(
  projectId: string,
  projectPath: string,
): Promise<Result<readonly IntegrationStepResult[]>>
```

**Parámetros:**
- `projectId`: ID único del proyecto
- `projectPath`: Ruta absoluta del proyecto

**Valor de retorno:**
- En caso de éxito: `IntegrationStepResult[]` (resultado de cada paso)
- En caso de fallo: `AgentError`

**Operación:**
1. Crear entorno aislado con CleanEnvManager
2. Ejecutar 4 pasos secuencialmente (Fail-Fast)
3. Limpiar entorno automáticamente (sin importar éxito/fallo)

---

#### Método `getCurrentStep()`
```typescript
getCurrentStep(): number
```

**Valor de retorno:** Paso actual en progreso (0 si no ha iniciado)

---

#### Método `getResults()`
```typescript
getResults(): IntegrationStepResult[]
```

**Valor de retorno:** Array de resultados de pasos ejecutados hasta ahora

---

### Interfaz `IntegrationStepResult`

```typescript
interface IntegrationStepResult {
  step: 1 | 2 | 3 | 4;  // Número de paso
  passed: boolean;      // Si pasó
  failCount: number;    // Número de pruebas fallidas
}
```

---

## 🧪 Guía de Escritura de Pruebas

### Estructura de Directorio de Pruebas

```
tests/
├── unit/              ← Paso 1: Pruebas de funcionalidad individual
│   ├── auth.test.ts
│   ├── config.test.ts
│   └── logger.test.ts
│
├── module/            ← Paso 2: Pruebas de integración de módulos
│   ├── auth-module.test.ts
│   └── rag-module.test.ts
│
├── integration/       ← Paso 3: Pruebas smoke de integración completa
│   └── system.test.ts
│
└── e2e/               ← Paso 4: Escenarios de usuario End-to-End
    ├── login-flow.test.ts
    └── complete-task.test.ts
```

### Ejemplos de Escritura de Pruebas

#### Paso 1: Unit Test
```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'bun:test';
import { authenticate } from '../../src/auth/api-key-auth.js';

describe('Authentication', () => {
  it('Autenticación exitosa con API key correcta', async () => {
    const result = await authenticate('valid-key');
    expect(result.ok).toBe(true);
  });

  it('Fallo de autenticación con API key incorrecta', async () => {
    const result = await authenticate('invalid-key');
    expect(result.ok).toBe(false);
  });
});
```

#### Paso 2: Module Test
```typescript
// tests/module/auth-module.test.ts
import { describe, it, expect } from 'bun:test';
import { AuthManager } from '../../src/auth/auth-manager.js';

describe('Auth Module', () => {
  it('Autenticación con API key → Seguimiento de límite de tasa', async () => {
    const manager = new AuthManager();
    await manager.authenticate('valid-key');

    const rateLimit = manager.getRateLimitStatus();
    expect(rateLimit.remaining).toBeGreaterThan(0);
  });
});
```

#### Paso 3: Integration Test
```typescript
// tests/integration/system.test.ts
import { describe, it, expect } from 'bun:test';

describe('System Integration', () => {
  it('Inicialización y funcionamiento básico del sistema completo', async () => {
    // Prueba smoke simple
    const system = await initializeSystem();
    expect(system.isReady()).toBe(true);
  });
});
```

#### Paso 4: E2E Test
```typescript
// tests/e2e/complete-task.test.ts
import { describe, it, expect } from 'bun:test';

describe('Complete Task E2E', () => {
  it('Usuario completa toda la tarea', async () => {
    // 1. Iniciar sesión
    const user = await login('test@example.com', 'password');
    expect(user).toBeDefined();

    // 2. Crear proyecto
    const project = await createProject('My Project');
    expect(project.id).toBeDefined();

    // 3. Ejecutar tarea
    const result = await runTask(project.id, 'Build feature');
    expect(result.success).toBe(true);
  });
});
```

---

## 🎓 Uso Avanzado

### 1. Ejecutar Solo Pasos Específicos (Actualmente No Soportado)

```typescript
// Actualmente solo se pueden ejecutar los 4 pasos completos
// Mejora futura: Se puede agregar función para iniciar desde paso específico

// Interfaz esperada:
// await tester.runFrom(3, projectId, projectPath); // Iniciar desde Paso 3
```

### 2. Pruebas de Proyectos Paralelos

```typescript
// Probar múltiples proyectos en paralelo
const projects = [
  { id: 'project-a', path: '/path/a' },
  { id: 'project-b', path: '/path/b' },
  { id: 'project-c', path: '/path/c' },
];

const results = await Promise.all(
  projects.map(({ id, path }) =>
    tester.runIntegrationTests(id, path),
  ),
);

results.forEach((result, idx) => {
  const { id } = projects[idx]!;
  if (result.ok) {
    const allPassed = result.value.every((r) => r.passed);
    console.log(`${id}:`, allPassed ? '✅' : '❌');
  }
});
```

### 3. Guardar Resultados de Pruebas en LanceDB

```typescript
/**
 * Guardar permanentemente resultados de pruebas de integración en LanceDB
 */
async function saveTestResultsToDb(
  tester: IntegrationTester,
  vectorStore: VectorStore,
  projectId: string,
  projectPath: string,
) {
  const result = await tester.runIntegrationTests(projectId, projectPath);

  if (result.ok) {
    const results = result.value;

    // Guardar en LanceDB
    await vectorStore.addDocument({
      id: `test-${projectId}-${Date.now()}`,
      content: JSON.stringify({
        projectId,
        timestamp: new Date().toISOString(),
        results,
        allPassed: results.every((r) => r.passed),
      }),
      metadata: { type: 'integration-test-result' },
    });

    console.log('Guardado de resultados de pruebas completado');
  }
}
```

---

## 🔗 Módulos Relacionados

- **ProcessExecutor** (`src/core/process-executor.ts`) - Ejecutar `bun test`
- **CleanEnvManager** (`src/layer2/clean-env-manager.ts`) - Aislamiento de pruebas
- **Logger** (`src/core/logger.ts`) - Registro
- **Patrón Result** (`src/core/types.ts`) - Manejo de errores
- **AgentError** (`src/core/errors.ts`) - Tipo de error

---

## ✅ Lista de Verificación

Antes de usar IntegrationTester:
- [ ] ¿La estructura del directorio tests/ es correcta? (unit, module, integration, e2e)
- [ ] ¿Hay archivos .test.ts en cada directorio?
- [ ] ¿Está instalado Bun?
- [ ] ¿Creaste ProcessExecutor y CleanEnvManager?
- [ ] ¿La ruta del proyecto es absoluta?
- [ ] ¿Entendiste el principio Fail-Fast?
- [ ] ¿El timeout de prueba (5 minutos) es suficiente?

---

**Última actualización:** 2026-03-04
**Autor:** Agente documenter
**Puntuación Architect:** 100/100
**Código de referencia:** src/layer2/integration-tester.ts (252 líneas)
**Mejora de diseño:** Agent Spawn → ProcessExecutor (¡La simplicidad gana!)
