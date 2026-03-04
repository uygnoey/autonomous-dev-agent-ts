> **Languages:** [한국어](../ko/embeddings.md) | [English](../en/embeddings.md) | [日本語](../ja/embeddings.md) | [Español](../es/embeddings.md)

# Embeddings — Proveedor de Incrustaciones

## 🎯 ¿Qué es esto?

**Analogía para principiantes:**
¡Es un traductor que convierte palabras en matrices de números!

Por ejemplo:
- "hello world" → `[0.23, -0.45, 0.67, ...]` (384 números)
- "안녕하세요" → `[0.19, -0.38, 0.71, ...]` (384 números)

¿Por qué hacemos esto? ¡Las computadoras no pueden entender el significado de las palabras, pero pueden calcular con números!

Las palabras con significados similares producen matrices de números similares:
- "dog" → `[0.1, 0.2, ...]`
- "puppy" → `[0.12, 0.19, ...]` (¡similar a dog!)
- "car" → `[0.8, -0.5, ...]` (¡completamente diferente de dog!)

**Descripción técnica:**
Sistema de incrustación de texto basado en ML utilizando la biblioteca Huggingface Transformers.
- Modelo: `all-MiniLM-L6-v2` (ligero, rápido, preciso)
- Dimensiones: Vector Float32 de 384 dimensiones
- Normalización: Normalización L2 (longitud del vector = 1.0)
- Soporte de procesamiento por lotes

---

## 🔍 ¿Por qué es necesario?

### 1. RAG (Generación Aumentada por Recuperación)
Al buscar código, necesitamos encontrar código "semánticamente" similar:

```
Pregunta del usuario: "¿Dónde está el código de autenticación de usuario?"
→ Incrustación: [0.23, -0.45, ...]

Búsqueda en el código base:
- auth.ts "user authentication" → [0.24, -0.44, ...] ✅ ¡Cerca!
- config.ts "configuration setup" → [0.89, -0.12, ...] ❌ Lejos
```

¡Es mucho más inteligente que la búsqueda simple por palabras clave!

### 2. Integración con Vector DB (LanceDB)
LanceDB es una base de datos optimizada para búsqueda de vectores:
- Convertir texto en incrustaciones → Guardar en LanceDB
- Convertir pregunta del usuario en incrustación → Búsqueda por similitud
- Devolver los resultados más relevantes

### 3. Restauración de Contexto
Puedes encontrar conversaciones o decisiones anteriores basándote en "significado":
```
Situación actual: "Error de gestión de estado Redux"
→ Búsqueda automática de situaciones similares pasadas: "Método de resolución de errores de estado Zustand"
```

---

## 📦 ¿Cómo se usa?

### Paso 1: Crear Proveedor

```typescript
import { createTransformersEmbeddingProvider } from '../rag/embeddings.js';
import { Logger } from '../core/logger.js';

// Crear logger
const logger = new Logger({ level: 'info' });

// Crear proveedor de incrustaciones (configuración predeterminada)
const embeddingProvider = createTransformersEmbeddingProvider(logger);

// O configuración personalizada
const customProvider = createTransformersEmbeddingProvider(
  logger,
  'my-embeddings',              // nombre
  'Xenova/all-MiniLM-L6-v2',    // modelo (predeterminado)
  384,                           // número de dimensiones (predeterminado)
);
```

### Paso 2: Inicialización

```typescript
// Cargar modelo (puede ocurrir descarga del modelo en la primera llamada)
const initResult = await embeddingProvider.initialize();

if (!initResult.ok) {
  console.error('Fallo en la inicialización:', initResult.error.message);
  return;
}

console.log('✅ ¡Carga del modelo de incrustaciones completa!');
```

### Paso 3: Incrustación de Texto Único

```typescript
// Convertir consulta en vector
const queryResult = await embeddingProvider.embedQuery('código de autenticación de usuario');

if (queryResult.ok) {
  const vector = queryResult.value;

  console.log('Dimensión del vector:', vector.length);      // 384
  console.log('Tipo de vector:', vector.constructor);  // Float32Array
  console.log('Primeros 5 valores:', vector.slice(0, 5)); // [0.23, -0.45, ...]
}
```

### Paso 4: Incrustación por Lotes (Múltiples Textos a la Vez)

```typescript
// Incrustar múltiples fragmentos de código a la vez
const texts = [
  'export function authenticate(user: User) { ... }',
  'class UserRepository { ... }',
  'interface AuthConfig { ... }',
];

const batchResult = await embeddingProvider.embed(texts);

if (batchResult.ok) {
  const vectors = batchResult.value;

  console.log('Número de vectores:', vectors.length);     // 3
  console.log('Dimensión de cada vector:', vectors[0].length); // 384

  // Cada vector está normalizado (longitud ≈ 1.0)
  vectors.forEach((vec, idx) => {
    console.log(`Vector de texto ${idx + 1}:`, vec.slice(0, 3));
  });
}
```

### Paso 5: Integración con LanceDB

```typescript
import { VectorStore } from '../rag/vector-store.js';

// Crear VectorStore (inyectar proveedor de incrustaciones)
const vectorStore = new VectorStore(
  logger,
  embeddingProvider,
  '/path/to/db',
);

await vectorStore.initialize();

// Agregar documento (generar incrustación automáticamente)
await vectorStore.addDocument({
  id: 'auth-001',
  content: 'export function authenticate(user: User) { ... }',
  metadata: { file: 'auth.ts', line: 42 },
});

// Búsqueda por similitud (la consulta también se incrusta automáticamente)
const searchResult = await vectorStore.search('autenticación de usuario', 5);
if (searchResult.ok) {
  console.log('Resultados de búsqueda:', searchResult.value);
}
```

---

## ⚠️ Puntos de Atención

### 1. Descarga del Modelo en la Primera Ejecución
**Se descarga el archivo del modelo en la primera ejecución (aproximadamente 80MB):**

```typescript
// Primera ejecución — Descarga del modelo (toma 10-30 segundos)
await embeddingProvider.initialize(); // ⏳ Descargando...

// Ejecuciones posteriores — Uso de caché (rápido)
await embeddingProvider.initialize(); // ⚡ Completa inmediatamente
```

**Solución:**
- Verificar conexión de red
- Asegurar suficiente espacio en disco (~100MB)
- Configurar timeout largo en la primera ejecución

### 2. Inicialización Automática
Se inicializa automáticamente en la primera llamada a `embed()`/`embedQuery()` incluso sin llamar a `initialize()`:

```typescript
const provider = createTransformersEmbeddingProvider(logger);

// Se puede omitir initialize()
const result = await provider.embedQuery('hello'); // Inicialización automática
```

Sin embargo, **se recomienda la inicialización explícita** (manejo de errores claro).

### 3. Tamaño del Lote
Demasiados textos incrustados a la vez pueden causar falta de memoria:

```typescript
// ❌ Peligroso: 10,000 textos a la vez
const result = await provider.embed(manyTexts); // ¡Falta de memoria!

// ✅ Seguro: Procesar en fragmentos
const BATCH_SIZE = 100;
for (let i = 0; i < manyTexts.length; i += BATCH_SIZE) {
  const batch = manyTexts.slice(i, i + BATCH_SIZE);
  const result = await provider.embed(batch);
  // Procesar resultados...
}
```

### 4. Atención a Cadenas Vacías
Las cadenas vacías también se incrustan pero producen vectores sin significado:

```typescript
// ⚠️ Incrustación sin significado
const result = await provider.embedQuery('');

// ✅ Validación de entrada
if (query.trim().length === 0) {
  console.error('No se puede incrustar consulta vacía.');
  return;
}
const result = await provider.embedQuery(query);
```

---

## 💡 Código de Ejemplo

### Ejemplo 1: Calcular Similitud de Código

```typescript
/**
 * Calcular similitud de dos fragmentos de código (similitud coseno)
 */
async function calculateSimilarity(
  provider: TransformersEmbeddingProvider,
  text1: string,
  text2: string,
): Promise<number> {
  // Incrustar ambos textos por lotes
  const result = await provider.embed([text1, text2]);

  if (!result.ok) {
    console.error('Fallo en incrustación:', result.error.message);
    return 0;
  }

  const [vec1, vec2] = result.value;
  if (!vec1 || !vec2) {
    return 0;
  }

  // Calcular similitud coseno (solo producto punto porque los vectores están normalizados)
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += (vec1[i] ?? 0) * (vec2[i] ?? 0);
  }

  return dotProduct; // -1.0 ~ 1.0 (más cercano a 1.0 = más similar)
}

// Ejemplo de uso:
const code1 = 'function login(user: User) { ... }';
const code2 = 'function authenticate(user: User) { ... }';
const code3 = 'function calculateTax(amount: number) { ... }';

const similarity12 = await calculateSimilarity(provider, code1, code2);
const similarity13 = await calculateSimilarity(provider, code1, code3);

console.log('login vs authenticate:', similarity12); // 0.85 (¡similar!)
console.log('login vs calculateTax:', similarity13); // 0.12 (¡diferente!)
```

### Ejemplo 2: Indexación de Código Base

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Incrustar e indexar todos los archivos TypeScript del proyecto
 */
async function indexCodebase(
  provider: TransformersEmbeddingProvider,
  projectPath: string,
): Promise<Array<{ file: string; vector: Float32Array; content: string }>> {
  const index: Array<{ file: string; vector: Float32Array; content: string }> = [];

  // Encontrar todos los archivos .ts en el directorio src/
  const files = await findTsFiles(path.join(projectPath, 'src'));

  // Procesar por lotes (100 a la vez)
  const BATCH_SIZE = 100;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    // Leer contenido de archivos
    const contents = await Promise.all(
      batch.map((file) => fs.readFile(file, 'utf-8')),
    );

    // Incrustación por lotes
    const result = await provider.embed(contents);
    if (!result.ok) {
      console.error('Fallo en incrustación:', result.error.message);
      continue;
    }

    // Agregar al índice
    result.value.forEach((vector, idx) => {
      const file = batch[idx];
      const content = contents[idx];
      if (file && content) {
        index.push({ file, vector, content });
      }
    });

    console.log(`Progreso: ${i + batch.length}/${files.length} archivos procesados`);
  }

  return index;
}

// Helper: Encontrar archivos .ts
async function findTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTsFiles(fullPath)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}
```

### Ejemplo 3: Búsqueda Semántica

```typescript
/**
 * Encontrar archivos más similares a la consulta en código indexado
 */
async function searchCode(
  provider: TransformersEmbeddingProvider,
  index: Array<{ file: string; vector: Float32Array; content: string }>,
  query: string,
  topK = 5,
): Promise<Array<{ file: string; similarity: number; content: string }>> {
  // Incrustar consulta
  const queryResult = await provider.embedQuery(query);
  if (!queryResult.ok) {
    console.error('Fallo en incrustación de consulta:', queryResult.error.message);
    return [];
  }

  const queryVector = queryResult.value;

  // Calcular similitud con todo el índice
  const results = index.map(({ file, vector, content }) => {
    let similarity = 0;
    for (let i = 0; i < queryVector.length; i++) {
      similarity += (queryVector[i] ?? 0) * (vector[i] ?? 0);
    }
    return { file, similarity, content };
  });

  // Ordenar por similitud y devolver los K superiores
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// Ejemplo de uso:
const index = await indexCodebase(provider, '/path/to/project');
const results = await searchCode(
  provider,
  index,
  'código de autenticación de usuario',
  5,
);

console.log('Resultados de búsqueda:');
results.forEach(({ file, similarity, content }) => {
  console.log(`- ${file} (similitud: ${similarity.toFixed(3)})`);
  console.log(`  contenido: ${content.slice(0, 100)}...`);
});
```

---

## 🐛 ¿Qué hacer si hay un error?

### Tipos de Códigos de Error

#### 1. `rag_embedding_error` (Fallo en carga del modelo)
**Causa:**
- Sin conexión de red
- Espacio insuficiente en disco
- Nombre de modelo incorrecto

**Solución:**
```typescript
const result = await provider.initialize();
if (!result.ok) {
  if (result.error.code === 'rag_embedding_error') {
    console.error('Fallo en carga del modelo. Lista de verificación:');
    console.error('1. Verificar conexión a internet');
    console.error('2. Verificar espacio en disco (se requieren al menos 100MB)');
    console.error('3. Verificar nombre del modelo:', modelName);
  }
}
```

#### 2. `rag_embedding_error` (Fallo en incrustación)
**Causa:**
- Texto de entrada demasiado largo (excede límite de tokens)
- Memoria insuficiente

**Solución:**
```typescript
// Truncar texto si es demasiado largo
const MAX_LENGTH = 512; // Número de tokens (aproximadamente número de palabras)

function truncateText(text: string, maxLength: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxLength) {
    return text;
  }
  return words.slice(0, maxLength).join(' ') + '...';
}

const truncated = truncateText(longText, MAX_LENGTH);
const result = await provider.embedQuery(truncated);
```

### Patrón de Manejo de Errores

```typescript
async function safeEmbed(
  provider: TransformersEmbeddingProvider,
  texts: string[],
): Promise<Float32Array[]> {
  // Filtrar cadenas vacías
  const filtered = texts.filter((t) => t.trim().length > 0);

  if (filtered.length === 0) {
    console.warn('No hay texto para incrustar.');
    return [];
  }

  // Truncar textos demasiado largos
  const truncated = filtered.map((t) => truncateText(t, 512));

  // Incrustar
  const result = await provider.embed(truncated);

  if (!result.ok) {
    console.error('Fallo en incrustación:', result.error.message);

    // Estrategia de reintento: reducir tamaño de lote a la mitad y reintentar
    if (truncated.length > 1) {
      console.log('Reintentando dividiendo el lote...');
      const mid = Math.floor(truncated.length / 2);
      const batch1 = await safeEmbed(provider, truncated.slice(0, mid));
      const batch2 = await safeEmbed(provider, truncated.slice(mid));
      return [...batch1, ...batch2];
    }

    return [];
  }

  return result.value;
}
```

---

## 📊 Referencia de API

### Clase `TransformersEmbeddingProvider`

#### Constructor
```typescript
constructor(
  name: string,
  modelName: string,
  dimensions: number,
  logger: Logger,
)
```

**Parámetros:**
- `name`: Nombre del proveedor
- `modelName`: Nombre del modelo Huggingface (ej: 'Xenova/all-MiniLM-L6-v2')
- `dimensions`: Número de dimensiones del vector (384)
- `logger`: Instancia de Logger

---

#### Método `initialize()`
```typescript
async initialize(): Promise<Result<void>>
```

**Descripción:** Cargar modelo en memoria. Puede ocurrir descarga del modelo en la primera llamada.

**Valor de retorno:** `ok(undefined)` en caso de éxito, `err(RagError)` en caso de fallo

---

#### Método `embed()`
```typescript
async embed(texts: string[]): Promise<Result<Float32Array[]>>
```

**Descripción:** Incrustar múltiples textos por lotes.

**Parámetros:**
- `texts`: Array de textos a incrustar

**Valor de retorno:**
- En caso de éxito: `ok([vec1, vec2, ...])` (cada vector es Float32Array normalizado)
- En caso de fallo: `err(RagError)`

---

#### Método `embedQuery()`
```typescript
async embedQuery(query: string): Promise<Result<Float32Array>>
```

**Descripción:** Incrustar una sola consulta. (Método de conveniencia de `embed([query])`)

**Parámetros:**
- `query`: Cadena de consulta a incrustar

**Valor de retorno:**
- En caso de éxito: `ok(vector)` (Float32Array normalizado)
- En caso de fallo: `err(RagError)`

---

### Función `createTransformersEmbeddingProvider()`

```typescript
function createTransformersEmbeddingProvider(
  logger: Logger,
  name?: string,
  modelName?: string,
  dimensions?: number,
): TransformersEmbeddingProvider
```

**Valores predeterminados:**
- `name`: 'transformers'
- `modelName`: 'Xenova/all-MiniLM-L6-v2'
- `dimensions`: 384

---

### Función `normalizeVector()`

```typescript
function normalizeVector(vector: Float32Array): Float32Array
```

**Descripción:** Normalizar vector L2 (longitud = 1.0).

**Parámetros:**
- `vector`: Vector a normalizar

**Valor de retorno:** Vector normalizado (no modifica el original)

---

## 🎓 Uso Avanzado

### 1. Usar Modelo Personalizado

Puedes usar otros modelos de Huggingface:

```typescript
// Modelo multilingüe (soporte mejorado para coreano)
const multilingual = new TransformersEmbeddingProvider(
  'multilingual',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  384,
  logger,
);

// Modelo más grande (mejor precisión, menor velocidad)
const large = new TransformersEmbeddingProvider(
  'large',
  'Xenova/all-mpnet-base-v2',
  768, // dimensiones aumentadas
  logger,
);
```

### 2. Optimización de Almacenamiento de Vectores

Float32Array es eficiente en memoria, pero para más compresión:

```typescript
// Conversión Float32 → Float16 (ahorro del 50% de memoria)
function compressVector(vec: Float32Array): Uint8Array {
  const compressed = new Uint8Array(vec.length * 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = floatToHalf(vec[i] ?? 0);
    compressed[i * 2] = f16 & 0xff;
    compressed[i * 2 + 1] = (f16 >> 8) & 0xff;
  }
  return compressed;
}

// Restauración Float16 → Float32
function decompressVector(compressed: Uint8Array): Float32Array {
  const vec = new Float32Array(compressed.length / 2);
  for (let i = 0; i < vec.length; i++) {
    const f16 = compressed[i * 2]! | (compressed[i * 2 + 1]! << 8);
    vec[i] = halfToFloat(f16);
  }
  return vec;
}
```

### 3. Estrategia de Caché

Cachear incrustaciones utilizadas frecuentemente:

```typescript
class CachedEmbeddingProvider {
  private cache = new Map<string, Float32Array>();

  constructor(private provider: TransformersEmbeddingProvider) {}

  async embedQuery(query: string): Promise<Result<Float32Array>> {
    // Verificar caché
    const cached = this.cache.get(query);
    if (cached) {
      return ok(cached);
    }

    // Fallo de caché — incrustación real
    const result = await this.provider.embedQuery(query);
    if (result.ok) {
      this.cache.set(query, result.value);
    }

    return result;
  }

  clearCache() {
    this.cache.clear();
  }
}
```

---

## 🔗 Módulos Relacionados

- **VectorStore** (`src/rag/vector-store.ts`) - Almacén de vectores LanceDB
- **CodeIndexer** (`src/rag/code-indexer.ts`) - Indexación de código base
- **Logger** (`src/core/logger.ts`) - Registro
- **Patrón Result** (`src/core/types.ts`) - Manejo de errores

---

## ✅ Lista de Verificación

Antes de usar Embeddings:
- [ ] ¿Creaste el Logger?
- [ ] ¿Hay conexión de red en la primera ejecución?
- [ ] ¿Hay suficiente espacio en disco? (mínimo 100MB)
- [ ] ¿Manejaste errores con el patrón Result?
- [ ] ¿El texto de entrada no es demasiado largo? (se recomienda 512 tokens o menos)

---

**Última actualización:** 2026-03-04
**Autor:** Agente documenter
**Modelo:** all-MiniLM-L6-v2 (384 dimensiones)
