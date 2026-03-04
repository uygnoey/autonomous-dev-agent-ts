> **Languages:** [한국어](../ko/process-executor.md) | [English](../en/process-executor.md) | [日本語](../ja/process-executor.md) | [Español](../es/process-executor.md)

# ProcessExecutor — Ejecutor de Procesos

## 🎯 ¿Qué es esto?

**Analogía para niños:**
Es un robot que le pide a la computadora que "¡ejecute otros programas!"

Por ejemplo:
- Ejecuta el programa "git" → verifica el estado del código
- Ejecuta "bun test" → ejecuta pruebas
- Ejecuta "ls" → muestra la lista de archivos

El robot espera hasta que el programa termine y luego trae los resultados.

**Descripción técnica:**
Es una utilidad de ejecución de procesos externos que envuelve `Bun.spawn`.
- Captura automática de stdout/stderr
- Gestión de timeout
- Manejo de errores integrado
- Devuelve patrón Result

---

## 🔍 ¿Por qué lo necesitamos?

### 1. Ejecución segura
Si usas `Bun.spawn` directamente:
- Tienes que implementar el manejo de timeout cada vez
- Si la salida es demasiado grande, la memoria se desborda
- El manejo de errores es complicado

ProcessExecutor resuelve esto automáticamente.

### 2. Interfaz consistente
Toda ejecución de procesos funciona de la misma manera:
```typescript
const result = await executor.execute('comando', ['argumentos']);
if (result.ok) {
  console.log(result.value.stdout); // salida del resultado
}
```

### 3. Observabilidad
Toda ejecución de procesos se registra a través del Logger.
- Qué comando se ejecutó
- Cuánto tiempo tomó
- Cuál fue el error

---

## 📦 ¿Cómo usarlo?

### Paso 1: Crear instancia

```typescript
import { ProcessExecutor } from '../core/process-executor.js';
import { Logger } from '../core/logger.js';

// Crear logger
const logger = new Logger({ level: 'info' });

// Crear ProcessExecutor
const executor = new ProcessExecutor(logger);
```

### Paso 2: Ejecutar comando simple

```typescript
// Ejecutar 'ls -la'
const result = await executor.execute('ls', ['-la']);

if (result.ok) {
  console.log('¡Ejecución exitosa!');
  console.log('Código de salida:', result.value.exitCode); // 0
  console.log('Salida:', result.value.stdout);
  console.log('Tiempo de ejecución:', result.value.durationMs, 'ms');
} else {
  console.error('Ejecución fallida:', result.error.message);
}
```

### Paso 3: Ejecutar con opciones

```typescript
// Verificar Git status (en un directorio específico)
const result = await executor.execute('git', ['status'], {
  cwd: '/path/to/project', // directorio de trabajo
  timeoutMs: 10000,         // timeout de 10 segundos
  env: {                     // variables de entorno adicionales
    GIT_PAGER: 'cat',
  },
});

if (result.ok) {
  console.log(result.value.stdout);
}
```

### Paso 4: Ejecutar con entrada stdin

```typescript
// Pasar entrada al comando echo
const result = await executor.execute('cat', [], {
  stdin: 'Hello, World!\n', // pasar por stdin
});

if (result.ok) {
  console.log(result.value.stdout); // "Hello, World!"
}
```

### Paso 5: Ejemplo de ejecución de pruebas

```typescript
// Ejecutar pruebas con Bun
const result = await executor.execute('bun', ['test', 'tests/unit'], {
  cwd: '/project/path',
  timeoutMs: 300000, // timeout de 5 minutos (las pruebas pueden tardar)
});

if (result.ok) {
  const { exitCode, stdout, stderr } = result.value;

  if (exitCode === 0) {
    console.log('✅ ¡Todas las pruebas pasaron!');
  } else {
    console.error('❌ Prueba fallida:');
    console.error(stderr);
  }
}
```

---

## ⚠️ Precauciones

### 1. Configuración de timeout
**Timeout predeterminado: 30 segundos**

Para tareas que tardan mucho, asegúrate de aumentar el timeout:
```typescript
// ❌ Ejemplo incorrecto: la compilación puede no terminar en 30 segundos
await executor.execute('bun', ['build']);

// ✅ Ejemplo correcto: establecer timeout suficiente
await executor.execute('bun', ['build'], {
  timeoutMs: 120000, // 2 minutos
});
```

### 2. Límite de tamaño de salida
**Salida máxima: 10MB**

Ten cuidado con comandos que producen archivos grandes:
```typescript
// ❌ Peligroso: error si se produce un archivo de 100MB
await executor.execute('cat', ['huge-file.log']);

// ✅ Seguro: solo salida parcial con head
await executor.execute('head', ['-n', '100', 'huge-file.log']);
```

### 3. Verificar directorio de trabajo
Si no especificas cwd, se ejecutará en el directorio actual:
```typescript
// Si quieres ejecutar en el directorio del proyecto, especifica cwd
await executor.execute('git', ['status'], {
  cwd: projectPath, // especificar explícitamente
});
```

### 4. Verificar patrón Result
Siempre verifica `.ok` antes de acceder a `.value`:
```typescript
// ❌ Peligroso: acceso a undefined en caso de error
const result = await executor.execute('unknown-command', []);
console.log(result.value.stdout); // ¡Error!

// ✅ Seguro: verificar ok antes de acceder
if (result.ok) {
  console.log(result.value.stdout);
} else {
  console.error(result.error.message);
}
```

---

## 💡 Código de ejemplo

### Ejemplo 1: Verificar commits de Git

```typescript
/**
 * Verificar si hay cambios sin confirmar en el repositorio Git
 */
async function hasUncommittedChanges(
  executor: ProcessExecutor,
  repoPath: string,
): Promise<boolean> {
  const result = await executor.execute('git', ['status', '--porcelain'], {
    cwd: repoPath,
  });

  if (!result.ok) {
    console.error('Git status falló:', result.error.message);
    return false;
  }

  // Si la salida no está vacía → hay cambios
  return result.value.stdout.trim().length > 0;
}
```

### Ejemplo 2: Reintentar en caso de timeout

```typescript
/**
 * Función que reintenta en caso de timeout
 */
async function executeWithRetry(
  executor: ProcessExecutor,
  command: string,
  args: string[],
  maxRetries = 3,
): Promise<Result<ProcessResult>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await executor.execute(command, args, {
      timeoutMs: 30000,
    });

    if (result.ok) {
      return result; // devolver inmediatamente si es exitoso
    }

    // No reintentar si no es un error de timeout
    if (result.error.code !== 'process_timeout') {
      return result;
    }

    console.log(`Timeout ocurrido (${attempt}/${maxRetries}), reintentando...`);
  }

  return err(new AdevError('process_timeout', 'Máximo de reintentos excedido'));
}
```

### Ejemplo 3: Mostrar progreso en tiempo real (versión simple)

```typescript
/**
 * Mostrar que está en progreso al ejecutar tareas largas
 */
async function executeWithProgress(
  executor: ProcessExecutor,
  command: string,
  args: string[],
  description: string,
): Promise<Result<ProcessResult>> {
  console.log(`⏳ ${description} iniciado...`);
  const startTime = Date.now();

  const result = await executor.execute(command, args, {
    timeoutMs: 120000, // 2 minutos
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.ok) {
    console.log(`✅ ${description} completado (${duration}s)`);
  } else {
    console.error(`❌ ${description} falló (${duration}s):`, result.error.message);
  }

  return result;
}

// Ejemplo de uso:
await executeWithProgress(executor, 'bun', ['test'], 'Ejecutar pruebas');
```

---

## 🐛 Solución de errores

### Tipos de códigos de error

ProcessExecutor devuelve 3 tipos de errores:

#### 1. `process_timeout`
**Causa:** El comando no se completó dentro del tiempo de timeout

**Solución:**
```typescript
// Aumenta timeoutMs
const result = await executor.execute('slow-command', [], {
  timeoutMs: 120000, // 30 segundos → 120 segundos
});
```

#### 2. `process_output_too_large`
**Causa:** stdout o stderr excede 10MB

**Solución:**
```typescript
// Agregar opciones para reducir la salida
const result = await executor.execute('cat', ['large-file.txt'], {
  // O usar head/tail para salida parcial
});

// Alternativa: redirigir a archivo
await executor.execute('sh', ['-c', 'cat large-file.txt > output.txt']);
```

#### 3. `process_execution_error`
**Causa:** La ejecución del proceso en sí falló (comando no encontrado, sin permisos, etc.)

**Solución:**
```typescript
const result = await executor.execute('nonexistent-command', []);
if (!result.ok) {
  if (result.error.code === 'process_execution_error') {
    console.error('No se puede encontrar o ejecutar el comando.');
    console.error('Verifica la ortografía del comando o si está en PATH.');
  }
}
```

### Patrón de manejo de errores

```typescript
const result = await executor.execute('some-command', ['arg1', 'arg2']);

if (!result.ok) {
  const { code, message } = result.error;

  switch (code) {
    case 'process_timeout':
      console.error('⏱️ ¡Timeout! El tiempo de ejecución del comando es demasiado largo.');
      console.error('→ Aumenta la opción timeoutMs.');
      break;

    case 'process_output_too_large':
      console.error('📦 ¡Tamaño de salida excedido! Superó 10MB.');
      console.error('→ Reduce la salida o redirige a archivo.');
      break;

    case 'process_execution_error':
      console.error('❌ Ejecución fallida:', message);
      console.error('→ Verifica si el comando existe y si tienes permisos.');
      break;

    default:
      console.error('❓ Error desconocido:', message);
  }

  return; // terminar después del manejo de errores
}

// Caso de éxito
console.log('✅ Ejecución exitosa:', result.value.stdout);
```

---

## 📊 Referencia de API

### Clase `ProcessExecutor`

#### Constructor
```typescript
constructor(logger: Logger)
```

**Parámetros:**
- `logger`: Instancia de Logger (para logging)

---

#### Método `execute()`
```typescript
async execute(
  command: string,
  args?: readonly string[],
  options?: ProcessOptions,
): Promise<Result<ProcessResult>>
```

**Parámetros:**
- `command`: Comando a ejecutar (ej: 'git', 'bun', 'ls')
- `args`: Array de argumentos del comando (opcional, predeterminado: `[]`)
- `options`: Opciones de ejecución (opcional)

**Valor de retorno:**
- `Result<ProcessResult>`: En caso de éxito `.ok === true`, en caso de fallo contiene `.error`

---

### Interfaz `ProcessOptions`

```typescript
interface ProcessOptions {
  cwd?: string;              // directorio de trabajo
  env?: Record<string, string>; // variables de entorno
  timeoutMs?: number;        // timeout (predeterminado: 30000ms)
  stdin?: string;            // entrada stdin
}
```

---

### Interfaz `ProcessResult`

```typescript
interface ProcessResult {
  exitCode: number;    // código de salida (0 = éxito)
  stdout: string;      // salida estándar
  stderr: string;      // error estándar
  durationMs: number;  // tiempo de ejecución (milisegundos)
}
```

---

## 🎓 Uso avanzado

### 1. Ejecución paralela

Ejecutar múltiples comandos simultáneamente:
```typescript
const [result1, result2, result3] = await Promise.all([
  executor.execute('bun', ['test', 'tests/unit']),
  executor.execute('bun', ['test', 'tests/module']),
  executor.execute('bun', ['test', 'tests/integration']),
]);

// Verificar si todos pasaron
if (result1.ok && result2.ok && result3.ok) {
  console.log('✅ ¡Todas las pruebas pasaron!');
}
```

### 2. Verificar código de error

Incluso si el programa termina con un código distinto de 0, Result puede ser ok:
```typescript
const result = await executor.execute('grep', ['pattern', 'file.txt']);

if (result.ok) {
  // La ejecución fue exitosa pero el resultado real se determina por exitCode
  if (result.value.exitCode === 0) {
    console.log('¡Patrón encontrado!');
  } else if (result.value.exitCode === 1) {
    console.log('Patrón no encontrado.');
  }
}
```

### 3. Sobrescribir variables de entorno

Cambiar solo variables de entorno específicas:
```typescript
const result = await executor.execute('node', ['script.js'], {
  env: {
    NODE_ENV: 'production',  // agregar/sobrescribir
    DEBUG: '*',              // habilitar debug
    // Las demás variables de entorno se heredan automáticamente
  },
});
```

---

## 🔗 Módulos relacionados

- **Logger** (`src/core/logger.ts`) - Responsable del logging
- **Patrón Result** (`src/core/types.ts`) - Patrón de manejo de errores
- **AdevError** (`src/core/errors.ts`) - Tipo de error

---

## ✅ Lista de verificación

Antes de usar ProcessExecutor:
- [ ] ¿Creaste una instancia de Logger?
- [ ] ¿La ortografía del comando es correcta?
- [ ] ¿El timeout es lo suficientemente largo?
- [ ] ¿Manejaste los errores con el patrón Result?
- [ ] ¿Configuraste cwd correctamente?

---

**Última actualización:** 2026-03-04
**Autor:** agente documenter
