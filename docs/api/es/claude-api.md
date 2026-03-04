> **Languages:** [한국어](../ko/claude-api.md) | [English](../en/claude-api.md) | [日本語](../ja/claude-api.md) | [Español](../es/claude-api.md)

# ClaudeApi — Envoltorio de Claude Messages API

## 🎯 ¿Qué es esto?

**Analogía para principiantes:**
ClaudeApi es como un "teléfono para hablar con IA"

Por ejemplo:
- Levantas el teléfono → dices "¿Hola?" → la IA responde "¡Hola!"
- Al escuchar una historia larga → te la cuentan en tiempo real palabra por palabra (streaming)
- Al hacer una pregunta corta → recibes toda la respuesta de una vez (no-streaming)

¿El teléfono se estropea? ¡Llama automáticamente de nuevo! (reintento)
¿Esperas demasiado tiempo? ¡Cuelga automáticamente! (timeout)

**Descripción técnica:**
Cliente que envuelve la Anthropic Claude Messages API.
- Llamadas streaming/no-streaming separadas
- Integración con AuthProvider (API key / token OAuth)
- Lógica de reintento (retroceso exponencial)
- Timeout con AbortController
- Seguimiento de uso de tokens
- Gestión automática de límite de tasa

---

## 🔍 ¿Por qué es necesario?

### 1. Llamadas API Seguras
Si usas `@anthropic-ai/sdk` directamente:
- Debes implementar lógica de reintento cada vez
- El manejo de timeout es complejo
- El seguimiento de tokens es difícil
- Debes gestionar el límite de tasa manualmente

ClaudeApi resuelve esto automáticamente.

### 2. Separación Streaming vs No-Streaming
Dos patrones de uso claramente separados:
```typescript
// Respuesta corta → No-streaming (recibir de una vez)
const result = await api.createMessage([
  { role: 'user', content: '¿Cuánto es 2+2?' }
]);

// Respuesta larga → Streaming (recibir en tiempo real)
await api.streamMessage([
  { role: 'user', content: 'Cuéntame una historia' }
], (event) => {
  if (event.type === 'content_delta') {
    process.stdout.write(event.text);
  }
});
```

### 3. Reintento Automático (Retroceso Exponencial)
Reintento automático en caso de error de red o límite de tasa:
```
Intento 1: Fallo (429 Too Many Requests) → Esperar 1 segundo
Intento 2: Fallo (503 Service Unavailable) → Esperar 2 segundos
Intento 3: ¡Éxito! ✅
```

---

## 📐 Arquitectura

### Estructura Central

```
┌───────────────────────────────────────────┐
│ ClaudeApi                                 │
├───────────────────────────────────────────┤
│ + createMessage()  → Llamada no-streaming│
│ + streamMessage()  → Llamada streaming    │
│                                           │
│ [Mecanismos Internos]                     │
│ - withRetry()      → Lógica de reintento │
│ - AbortController  → Timeout              │
│ - AuthProvider     → Integración de auth  │
│ - Rate Limit Track → Gestión de tokens    │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Anthropic SDK (@anthropic-ai/sdk)         │
│ messages.create()                         │
└───────────────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ Claude Messages API (Servidor Anthropic)  │
└───────────────────────────────────────────┘
```

### Flujo de Lógica de Reintento (Retroceso Exponencial)

```
┌──────────────┐
│ Inicio llamada API │
└──────┬───────┘
       ↓
┌──────────────┐
│ Intento 1    │
└──────┬───────┘
       ↓
   ¿Éxito? ───SÍ──→ ✅ Devolver resultado
     │
     NO (error)
     ↓
  ¿Reintentable? (429, 500, 502, 503, 504)
     │
     NO ───→ ❌ Devolver error
     │
     SÍ
     ↓
┌──────────────┐
│ Esperar 1s   │
└──────┬───────┘
       ↓
┌──────────────┐
│ Intento 2    │
└──────┬───────┘
       ↓
   ¿Éxito? ───SÍ──→ ✅ Devolver resultado
     │
     NO
     ↓
┌──────────────┐
│ Esperar 2s   │
└──────┬───────┘
       ↓
┌──────────────┐
│ Intento 3    │
└──────┬───────┘
       ↓
   ¿Éxito? ───SÍ──→ ✅ Devolver resultado
     │
     NO ───→ ❌ Devolver error final
```

### Mecanismo de Timeout (AbortController)

```
┌──────────────────────────────────┐
│ Inicio llamada API + timer (60s) │
└────────┬─────────────────────────┘
         ↓
     ¿Completo antes de 60s? ───SÍ──→ ✅ Cancelar timer, devolver resultado
         │
         NO
         ↓
     ┌────────────────────┐
     │ AbortController.abort() │
     └────────┬───────────┘
              ↓
         ❌ Error de timeout
```

---

## 🔧 Dependencias

### Dependencias Directas
- `@anthropic-ai/sdk` — SDK oficial de Anthropic
- `../auth/types` — AuthProvider (autenticación)
- `../core/logger` — Logger (registro)
- `../core/types` — Patrón Result
- `../core/errors` — AgentError, RetryPolicy

### Gráfico de Dependencias
```
layer1/claude-api
  ↓
┌──────────────┬──────────────┬──────────────┐
│ auth/types   │ core/logger  │ core/types   │
└──────────────┴──────────────┴──────────────┘
        ↓
    core/config
```

**Regla:** layer1 solo puede depender de core, auth (no layer2)

---

## 📦 ¿Cómo se usa?

### Paso 1: Instalar Paquete (Verificar Blocker #1)

```bash
# Verificar paquete @anthropic-ai/sdk
bun pm ls | grep anthropic

# Si no está instalado:
bun add @anthropic-ai/sdk

# Verificar instalación
bun pm ls @anthropic-ai/sdk
```

### Paso 2: Crear Instancia

```typescript
import { ClaudeApi } from '../layer1/claude-api.js';
import { ApiKeyAuthProvider } from '../auth/api-key-auth.js';
import { Logger } from '../core/logger.js';
import { DEFAULT_RETRY_POLICY } from '../core/errors.js';

// 1. Crear logger
const logger = new Logger({ level: 'info' });

// 2. Crear proveedor de autenticación
const authProvider = new ApiKeyAuthProvider(
  'tu-api-key-aquí', // En realidad se obtiene de config
  logger,
);

// 3. Crear ClaudeApi
const api = new ClaudeApi(
  authProvider,
  logger,
  DEFAULT_RETRY_POLICY, // Opcional: 3 reintentos, retroceso exponencial
);
```

### Paso 3: Crear Mensaje No-Streaming (Respuesta Corta)

```typescript
// Pregunta simple → Recibir respuesta de una vez
const result = await api.createMessage(
  [{ role: 'user', content: '¿Cuánto es 2+2?' }],
  {
    model: 'claude-opus-4-20250514',
    maxTokens: 100,
    temperature: 0.7,
    timeoutMs: 30000, // Timeout de 30 segundos
  },
);

if (result.ok) {
  console.log('Respuesta:', result.value.content);
  console.log('Tokens usados:', {
    input: result.value.metadata.inputTokens,
    output: result.value.metadata.outputTokens,
  });
} else {
  console.error('Error:', result.error.message);
}
```

### Paso 4: Crear Mensaje Streaming (Respuesta Larga)

```typescript
// Historia larga → Recibir en tiempo real palabra por palabra
const result = await api.streamMessage(
  [{ role: 'user', content: 'Cuéntame una historia larga sobre un dragón' }],
  (event) => {
    if (event.type === 'content_start') {
      console.log('Iniciando streaming...');
    } else if (event.type === 'content_delta') {
      // Salida de texto en tiempo real
      process.stdout.write(event.text);
    } else if (event.type === 'content_stop') {
      console.log('\nStreaming terminado.');
    } else if (event.type === 'message_complete') {
      console.log('Uso de tokens:', event.metadata.inputTokens, event.metadata.outputTokens);
    }
  },
  {
    maxTokens: 2048,
    timeoutMs: 120000, // Timeout de 2 minutos (para respuesta larga)
  },
);

if (!result.ok) {
  console.error('Error de streaming:', result.error.message);
}
```

### Paso 5: Conversación de Múltiples Turnos

```typescript
const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// Primera pregunta
conversation.push({ role: 'user', content: 'Mi nombre es Alice' });

const result1 = await api.createMessage(conversation);
if (result1.ok) {
  conversation.push({ role: 'assistant', content: result1.value.content });
  console.log('IA:', result1.value.content);
}

// Segunda pregunta (recordando conversación anterior)
conversation.push({ role: 'user', content: '¿Cuál es mi nombre?' });

const result2 = await api.createMessage(conversation);
if (result2.ok) {
  console.log('IA:', result2.value.content); // "Tu nombre es Alice"
}
```

---

## ⚠️ Puntos de Atención

### 1. Configuración de Timeout
**Timeout predeterminado: 60 segundos**

Para respuestas largas o tareas complejas, aumenta el timeout:
```typescript
// ❌ Ejemplo incorrecto: Historia larga puede no completarse en 60s
await api.streamMessage(messages, onEvent);

// ✅ Ejemplo correcto: Configurar timeout suficiente
await api.streamMessage(messages, onEvent, {
  timeoutMs: 180000, // 3 minutos
});
```

### 2. Solo Errores Reintentables se Reintentan
**Códigos de estado HTTP que se reintentan:**
- `429` Too Many Requests (límite de tasa)
- `500` Internal Server Error
- `502` Bad Gateway
- `503` Service Unavailable
- `504` Gateway Timeout

**Errores que NO se reintentan:**
- `400` Bad Request (solicitud incorrecta)
- `401` Unauthorized (fallo de autenticación)
- `403` Forbidden (sin permisos)
- `404` Not Found (modelo no encontrado)

```typescript
const result = await api.createMessage(messages);

if (!result.ok) {
  const { code } = result.error;

  if (code === 'api_rate_limit') {
    // Fallo después de reintentar → límite de tasa excedido
    console.error('Límite de tasa excedido. Intenta de nuevo más tarde.');
  } else if (code === 'api_auth_error') {
    // No se reintenta → verificar API key
    console.error('Verifica tu API key.');
  }
}
```

### 3. Configuración de maxTokens
Configura suficientes tokens para evitar que la salida se corte:
```typescript
// ❌ Peligroso: La respuesta larga puede cortarse
await api.createMessage(messages, { maxTokens: 100 });

// ✅ Seguro: Suficientes tokens
await api.createMessage(messages, { maxTokens: 4096 });
```

### 4. Orden de Eventos de Streaming
El orden de eventos de streaming está garantizado:
```
1. content_start (inicio)
2. content_delta (múltiples veces, fragmentos de texto)
3. content_stop (fin)
4. message_complete (metadatos)
```

Asegúrate de procesar en este orden:
```typescript
let fullText = '';

await api.streamMessage(messages, (event) => {
  switch (event.type) {
    case 'content_start':
      fullText = '';
      break;
    case 'content_delta':
      fullText += event.text;
      break;
    case 'content_stop':
      console.log('Texto completo:', fullText);
      break;
    case 'message_complete':
      console.log('Tokens:', event.metadata.outputTokens);
      break;
  }
});
```

---

## 💡 Código de Ejemplo

### Ejemplo 1: Probar Lógica de Reintento

```typescript
/**
 * Función para probar la lógica de reintento
 */
async function testRetryLogic(api: ClaudeApi) {
  console.log('Iniciando prueba de reintento...');

  // Llamar rápidamente hasta alcanzar el límite de tasa intencionalmente
  for (let i = 0; i < 100; i++) {
    const result = await api.createMessage(
      [{ role: 'user', content: `Prueba ${i}` }],
      { maxTokens: 10 },
    );

    if (!result.ok && result.error.code === 'api_rate_limit') {
      console.log(`¡Límite de tasa alcanzado en solicitud ${i}!`);
      console.log('ClaudeApi reintentará automáticamente...');

      // Si tiene éxito después del reintento, continuar
      if (result.ok) {
        console.log('¡Reintento exitoso!');
      }
    }
  }
}
```

### Ejemplo 2: Manejo de Timeout

```typescript
/**
 * Recibir respuesta dentro del tiempo de timeout
 */
async function askWithTimeout(
  api: ClaudeApi,
  question: string,
  timeoutMs: number,
): Promise<string | null> {
  const result = await api.createMessage(
    [{ role: 'user', content: question }],
    { timeoutMs },
  );

  if (!result.ok) {
    if (result.error.code === 'api_timeout') {
      console.error(`No se recibió respuesta en ${timeoutMs}ms.`);
      return null;
    }
    console.error('Error:', result.error.message);
    return null;
  }

  return result.value.content;
}

// Ejemplo de uso:
const answer = await askWithTimeout(api, 'Resolver problema matemático complejo', 30000);
if (answer) {
  console.log('Respuesta:', answer);
}
```

### Ejemplo 3: Streaming en Tiempo Real + Conteo de Tokens

```typescript
/**
 * Estimación de tokens en tiempo real durante streaming
 */
async function streamWithTokenCounting(
  api: ClaudeApi,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  let fullText = '';
  let estimatedTokens = 0;

  const result = await api.streamMessage(
    messages,
    (event) => {
      if (event.type === 'content_delta') {
        fullText += event.text;

        // Estimación aproximada de tokens (inglés: 4 caracteres ≈ 1 token, coreano: 1.5 caracteres ≈ 1 token)
        estimatedTokens = Math.ceil(fullText.length / 4);

        // Salida en tiempo real
        process.stdout.write(event.text);
        process.stdout.write(`\r[Tokens estimados: ${estimatedTokens}]`);
      } else if (event.type === 'message_complete') {
        console.log(`\n\nTokens reales: ${event.metadata.outputTokens}`);
        console.log(`Diferencia estimada vs real: ${Math.abs(estimatedTokens - event.metadata.outputTokens)}`);
      }
    },
  );

  if (!result.ok) {
    console.error('Error de streaming:', result.error.message);
  }
}
```

---

## 🐛 ¿Qué hacer si hay un error?

### Tipos de Códigos de Error

ClaudeApi devuelve los siguientes errores:

#### 1. `api_auth_error`
**Causa:** API key no presente o expirada

**Solución:**
```typescript
const result = await api.createMessage(messages);
if (!result.ok && result.error.code === 'api_auth_error') {
  console.error('Verifica tu API key:');
  console.error('1. Configurar ANTHROPIC_API_KEY en archivo .env');
  console.error('2. Verificar validez de API key');
  console.error('3. Verificar permisos');
}
```

#### 2. `api_rate_limit`
**Causa:** Límite de tasa excedido (fallo después de 3 reintentos)

**Solución:**
```typescript
if (!result.ok && result.error.code === 'api_rate_limit') {
  console.error('¡Límite de tasa excedido!');
  console.error('Soluciones:');
  console.error('1. Esperar y reintentar');
  console.error('2. Aumentar intervalo entre solicitudes');
  console.error('3. Considerar actualización de Tier');

  // Esperar 1 minuto y reintentar
  await new Promise(resolve => setTimeout(resolve, 60000));
  const retryResult = await api.createMessage(messages);
}
```

#### 3. `api_timeout`
**Causa:** Tiempo de timeout excedido

**Solución:**
```typescript
if (!result.ok && result.error.code === 'api_timeout') {
  console.error('¡Timeout! Intenta lo siguiente:');
  console.error('1. Aumentar timeoutMs');
  console.error('2. Reducir maxTokens (solicitar respuesta más corta)');
  console.error('3. Simplificar pregunta');

  // Duplicar timeout y reintentar
  const retryResult = await api.createMessage(messages, {
    timeoutMs: 120000, // 60s → 120s
  });
}
```

#### 4. `api_network_error`
**Causa:** Fallo de conexión de red

**Solución:**
```typescript
if (!result.ok && result.error.code === 'api_network_error') {
  console.error('Error de red:');
  console.error('1. Verificar conexión a internet');
  console.error('2. Verificar configuración de proxy');
  console.error('3. Verificar estado del servidor de Anthropic');
}
```

#### 5. `api_invalid_request`
**Causa:** Solicitud incorrecta (400 Bad Request)

**Solución:**
```typescript
if (!result.ok && result.error.code === 'api_invalid_request') {
  console.error('Solicitud incorrecta:');
  console.error('1. Verificar formato de mensaje (role, content requeridos)');
  console.error('2. Verificar nombre del modelo');
  console.error('3. Verificar rango de maxTokens (1 ~ 4096)');
  console.error('4. Verificar rango de temperature (0.0 ~ 1.0)');
}
```

### Patrón de Manejo de Errores

```typescript
async function safeApiCall(
  api: ClaudeApi,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxRetries = 3,
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await api.createMessage(messages);

    if (result.ok) {
      return result.value.content;
    }

    const { code, message } = result.error;
    console.error(`Intento ${attempt}/${maxRetries} fallido:`, message);

    // Verificar si el error es reintentar
    if (code === 'api_rate_limit' || code === 'api_network_error') {
      const waitTime = Math.pow(2, attempt) * 1000; // Retroceso exponencial
      console.log(`Esperando ${waitTime}ms antes de reintentar...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    // Error no reintentar
    if (code === 'api_auth_error' || code === 'api_invalid_request') {
      console.error('Error no reintentar.');
      return null;
    }
  }

  console.error('Número máximo de reintentos excedido');
  return null;
}
```

---

## 📊 Referencia de API

### Clase `ClaudeApi`

#### Constructor
```typescript
constructor(
  authProvider: AuthProvider,
  logger: Logger,
  retryPolicy?: RetryPolicy,
)
```

**Parámetros:**
- `authProvider`: Proveedor de autenticación (API key / OAuth)
- `logger`: Instancia de Logger
- `retryPolicy`: Política de reintento (predeterminado: 3 reintentos, retroceso exponencial)

---

#### Método `createMessage()` (No-Streaming)
```typescript
async createMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options?: ClaudeApiRequestOptions,
): Promise<Result<ClaudeApiResponse>>
```

**Parámetros:**
- `messages`: Array de mensajes de conversación
- `options`: Opciones de solicitud
  - `model`: Nombre del modelo (predeterminado: 'claude-opus-4-20250514')
  - `maxTokens`: Tokens máximos de salida (predeterminado: 4096)
  - `temperature`: Temperatura 0.0~1.0 (predeterminado: 1.0)
  - `timeoutMs`: Timeout en milisegundos (predeterminado: 60000)

**Valor de retorno:**
- En caso de éxito: `ClaudeApiResponse` (content, metadata)
- En caso de fallo: `AgentError`

---

#### Método `streamMessage()` (Streaming)
```typescript
async streamMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onEvent: StreamCallback,
  options?: ClaudeApiRequestOptions,
): Promise<Result<void>>
```

**Parámetros:**
- `messages`: Array de mensajes de conversación
- `onEvent`: Callback de evento de streaming
- `options`: Opciones de solicitud

**Valor de retorno:**
- En caso de éxito: `ok(void)`
- En caso de fallo: `AgentError`

---

### Interfaz `ClaudeApiRequestOptions`

```typescript
interface ClaudeApiRequestOptions {
  model?: string;         // Nombre del modelo
  maxTokens?: number;     // Tokens máximos de salida
  temperature?: number;   // Temperatura (0.0~1.0)
  timeoutMs?: number;     // Timeout (milisegundos)
}
```

---

### Interfaz `ClaudeApiResponse`

```typescript
interface ClaudeApiResponse {
  content: string;                      // Texto de respuesta
  metadata: ClaudeApiResponseMetadata;  // Metadatos
}

interface ClaudeApiResponseMetadata {
  model: string;          // Modelo usado
  inputTokens: number;    // Número de tokens de entrada
  outputTokens: number;   // Número de tokens de salida
  stopReason: string;     // Razón de detención
}
```

---

### Tipo `ClaudeStreamEvent`

```typescript
type ClaudeStreamEvent =
  | { type: 'content_start' }                                    // Inicio
  | { type: 'content_delta'; text: string }                      // Fragmento de texto
  | { type: 'content_stop' }                                     // Fin
  | { type: 'message_complete'; metadata: ClaudeApiResponseMetadata };  // Completo
```

---

## 🎓 Uso Avanzado

### 1. Política de Reintento Personalizada

```typescript
import type { RetryPolicy } from '../core/errors.js';

// Política de reintento personalizada (5 reintentos, espera inicial de 2s)
const customRetryPolicy: RetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const api = new ClaudeApi(authProvider, logger, customRetryPolicy);
```

### 2. Autenticación con Token OAuth

```typescript
import { SubscriptionAuthProvider } from '../auth/subscription-auth.js';

// Usar token OAuth
const authProvider = new SubscriptionAuthProvider(
  'oauth-token-aquí',
  logger,
);

const api = new ClaudeApi(authProvider, logger);
```

### 3. Seguimiento de Uso de Tokens

```typescript
let totalInputTokens = 0;
let totalOutputTokens = 0;

async function trackTokenUsage(
  api: ClaudeApi,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  const result = await api.createMessage(messages);

  if (result.ok) {
    totalInputTokens += result.value.metadata.inputTokens;
    totalOutputTokens += result.value.metadata.outputTokens;

    console.log('Tokens acumulados:', {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalInputTokens + totalOutputTokens,
    });
  }
}
```

### 4. Solicitudes Paralelas (Preguntas Independientes)

```typescript
// Procesar múltiples preguntas independientes en paralelo
const questions = [
  '¿Cuánto es 2+2?',
  '¿Cuál es la capital de Francia?',
  '¿Quién escribió Hamlet?',
];

const results = await Promise.all(
  questions.map(q =>
    api.createMessage([{ role: 'user', content: q }]),
  ),
);

results.forEach((result, idx) => {
  if (result.ok) {
    console.log(`P${idx + 1}:`, questions[idx]);
    console.log(`R${idx + 1}:`, result.value.content);
  }
});
```

---

## 🔗 Módulos Relacionados

- **AuthProvider** (`src/auth/types.ts`) - Autenticación API key / OAuth
- **Logger** (`src/core/logger.ts`) - Registro
- **Patrón Result** (`src/core/types.ts`) - Manejo de errores
- **AgentError** (`src/core/errors.ts`) - Tipo de error
- **ProcessExecutor** (`src/core/process-executor.ts`) - Ejecución de proceso externo

---

## ✅ Lista de Verificación

Antes de usar ClaudeApi:
- [ ] ¿Está instalado el paquete @anthropic-ai/sdk?
- [ ] ¿Está configurada la API key o token OAuth?
- [ ] ¿Creaste correctamente el AuthProvider?
- [ ] ¿El timeout es suficientemente largo para la tarea?
- [ ] ¿maxTokens es suficiente para la longitud de respuesta esperada?
- [ ] ¿Manejaste errores con el patrón Result?
- [ ] ¿Manejaste todos los tipos de eventos al usar streaming?

---

**Última actualización:** 2026-03-04
**Autor:** Agente documenter
**Puntuación Architect:** 99/100
**Puntuación Reviewer:** 97/100
**Código de referencia:** src/layer1/claude-api.ts (520 líneas)
