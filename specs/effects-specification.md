# Спецификация модуля @holon/effects

**Version:** 10.0.0
**Status:** Полная спецификация
**Date:** 2025-09-29

## Оглавление

1. [Введение](#введение)
2. [Философия и принципы](#философия-и-принципы)
3. [Архитектура](#архитектура)
4. [API Reference](#api-reference)
5. [Практические кейсы](#практические-кейсы)
6. [Паттерны использования](#паттерны-использования)
7. [Интеграция с экосистемой](#интеграция-с-экосистемой)
8. [План доработки](#план-доработки)

---

## Введение

Модуль `@holon/effects` предоставляет полноценную систему управления побочными эффектами в функциональном стиле, основанную на алгебраических эффектах и монадическом подходе. Система позволяет явно отслеживать, компоновать и интерпретировать эффекты, обеспечивая при этом type-safety и возможность тестирования.

### Ключевые возможности

- **Алгебраические эффекты** - декларативное описание побочных эффектов
- **Битовые флаги** - эффективное представление комбинаций эффектов
- **IO монада** - изоляция побочных эффектов
- **Effect интерпретаторы** - различные стратегии выполнения
- **Type-safe композиция** - строгая типизация на всех уровнях
- **Runtime и compile-time проверки** - валидация эффектов
- **Тестируемость** - возможность мокирования любых эффектов

## Философия и принципы

### 1. Явность превыше всего
Все побочные эффекты должны быть явно обозначены в типах:

```typescript
// ❌ Плохо: эффекты скрыты
function saveUser(user: User): Promise<void> {
  console.log('Saving user'); // Скрытый IO эффект
  await db.save(user);        // Скрытый Write эффект
  sendEmail(user.email);      // Скрытый Network эффект
}

// ✅ Хорошо: эффекты явные
const saveUser: EffectFlow<User, void,
  EffectFlags.IO | EffectFlags.Write | EffectFlags.Network
> = effectful(
  async (user: User) => {
    await Effects.log(`Saving user ${user.id}`);
    await Effects.writeDb(user);
    await Effects.sendEmail(user.email);
  },
  EffectFlags.IO | EffectFlags.Write | EffectFlags.Network
);
```

### 2. Композируемость
Эффекты должны естественно компоноваться:

```typescript
const readConfig = effectful(
  () => Effects.readFile('config.json'),
  EffectFlags.Read | EffectFlags.IO
);

const parseConfig = pure((json: string) => JSON.parse(json));

const validateConfig = pure((config: any): Config => {
  if (!config.apiUrl) throw new Error('Missing apiUrl');
  return config as Config;
});

// Композиция сохраняет информацию об эффектах
const loadConfig = readConfig
  .pipe(parseConfig)
  .pipe(validateConfig);
// Type: EffectFlow<void, Config, EffectFlags.Read | EffectFlags.IO>
```

### 3. Интерпретируемость
Один и тот же эффект может иметь разные интерпретации:

```typescript
// Production интерпретатор
const prodInterpreter = new EffectInterpreter()
  .register(Effects.log)
  .register(Effects.readFile)
  .register(Effects.writeFile);

// Test интерпретатор
const testInterpreter = EffectInterpreter.pure();

// Один и тот же flow, разные интерпретации
await prodInterpreter.run(myFlow, input, context);
await testInterpreter.run(myFlow, input, context);
```

## Архитектура

### Слои архитектуры

```
┌─────────────────────────────────────────┐
│         Application Layer               │
│   (Business logic with effects)         │
├─────────────────────────────────────────┤
│         Effect Composition              │
│     (Combinators & transformers)        │
├─────────────────────────────────────────┤
│         Effect Definition               │
│    (Algebraic effects & handlers)       │
├─────────────────────────────────────────┤
│         Effect Runtime                  │
│      (Interpreters & execution)         │
├─────────────────────────────────────────┤
│         Platform Layer                  │
│    (Node.js, Deno, Bun, Browser)        │
└─────────────────────────────────────────┘
```

### Компоненты системы

#### 1. Effect Flags (битовые флаги)

```typescript
export enum EffectFlags {
  None    = 0,        // Чистая функция
  Read    = 1 << 0,   // Чтение данных
  Write   = 1 << 1,   // Запись данных
  IO      = 1 << 2,   // I/O операции
  Network = 1 << 3,   // Сетевые операции
  Random  = 1 << 4,   // Случайные числа
  Time    = 1 << 5,   // Время/таймеры
  Throw   = 1 << 6,   // Исключения
  Async   = 1 << 7,   // Асинхронность
  // Расширенные флаги
  Process = 1 << 8,   // Процессы/потоки
  Memory  = 1 << 9,   // Управление памятью
  State   = 1 << 10,  // Мутабельное состояние
  Unsafe  = 1 << 11,  // Небезопасные операции
  // Комбинированные флаги
  FileSystem = Read | Write | IO,
  Database = Read | Write | Network | Async,
  Pure = None,
}
```

#### 2. Effect Descriptor

```typescript
export interface Effect<T = any, R = any> {
  id: symbol;                    // Уникальный идентификатор
  flags: EffectFlags;            // Битовые флаги эффекта
  handler: EffectHandler<T, R>;  // Обработчик эффекта
  cleanup?: (result: R) => void; // Опциональная очистка
  metadata?: EffectMetadata;     // Метаданные для анализа
}

export interface EffectMetadata {
  name: string;
  description?: string;
  category?: EffectCategory;
  performance?: PerformanceHints;
  security?: SecurityConstraints;
}
```

#### 3. EffectFlow Interface

```typescript
export interface EffectFlow<In, Out, E extends EffectFlags = EffectFlags>
  extends Flow<In, Out> {
  readonly effects: Set<Effect>;
  readonly flags: E;
  readonly metadata: FlowMetadata;

  // Операции над эффектами
  restrict<R extends E>(allowed: R): EffectFlow<In, Out, R>;
  handle(interpreter: EffectInterpreter): Flow<In, Out>;
  analyze(): EffectAnalysis;
  optimize(): EffectFlow<In, Out, E>;
}
```

## API Reference

### Основные функции

#### `effect<T, R>(definition: EffectDefinition<T, R>): Effect<T, R>`

Создает новый эффект:

```typescript
const customEffect = effect({
  id: Symbol('custom'),
  flags: EffectFlags.IO | EffectFlags.Async,
  handler: async (value: string, ctx: Context) => {
    // Реализация эффекта
    return await someAsyncOperation(value);
  },
  cleanup: (result) => {
    // Очистка ресурсов
    releaseResources(result);
  },
  metadata: {
    name: 'Custom Effect',
    category: 'io',
    performance: { expectedMs: 100 }
  }
});
```

#### `effectful<In, Out, E>(fn, flags): EffectFlow<In, Out, E>`

Создает Flow с эффектами:

```typescript
const readUserData = effectful(
  async (userId: string) => {
    const user = await db.users.findById(userId);
    const profile = await db.profiles.findByUserId(userId);
    return { user, profile };
  },
  EffectFlags.Read | EffectFlags.Async | EffectFlags.Network
);
```

#### `pure<In, Out>(fn): EffectFlow<In, Out, EffectFlags.None>`

Создает чистый Flow без эффектов:

```typescript
const calculate = pure((x: number) => x * 2 + 1);
// Type: EffectFlow<number, number, EffectFlags.None>
```

#### `IO<T>` - монада для изоляции эффектов

```typescript
// Создание IO
const readFile = IO.async(() => fs.readFile('data.txt'));

// Композиция через map
const parsed = readFile
  .map(content => JSON.parse(content))
  .map(data => data.users)
  .map(users => users.filter(u => u.active));

// Композиция через flatMap
const saveUsers = parsed
  .flatMap(users => IO.async(() => db.save(users)))
  .flatMap(() => IO.of('Success'));

// Выполнение
const result = await saveUsers.run();
```

### Effect Combinators

#### `parallel<E>(...effects): EffectFlow<In, Out[], E>`

Параллельное выполнение эффектов:

```typescript
const fetchAll = parallel(
  effectful(() => fetch('/api/users'), EffectFlags.Network),
  effectful(() => fetch('/api/products'), EffectFlags.Network),
  effectful(() => fetch('/api/orders'), EffectFlags.Network)
);
// Type: EffectFlow<void, [Users, Products, Orders], EffectFlags.Network>
```

#### `sequential<E>(...effects): EffectFlow<In, Out, E>`

Последовательное выполнение с передачей результата:

```typescript
const pipeline = sequential(
  effectful(readFile, EffectFlags.Read),
  pure(parse),
  effectful(validate, EffectFlags.IO),
  effectful(save, EffectFlags.Write)
);
```

#### `conditional<E1, E2>(condition, ifTrue, ifFalse): EffectFlow`

Условное выполнение эффектов:

```typescript
const conditionalSave = conditional(
  (data: Data) => data.isValid,
  effectful(saveToDb, EffectFlags.Write),
  effectful(logError, EffectFlags.IO)
);
```

### Effect Transformers

#### `suppress<E>(effect, fallback): EffectFlow<In, Out, E>`

Подавление ошибок в эффекте:

```typescript
const safeRead = suppress(
  effectful(readFile, EffectFlags.Read),
  () => 'default content'
);
```

#### `retry<E>(effect, options): EffectFlow<In, Out, E>`

Повтор эффекта при ошибке:

```typescript
const reliableFetch = retry(
  effectful(fetchData, EffectFlags.Network),
  {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential'
  }
);
```

#### `timeout<E>(effect, ms): EffectFlow<In, Out, E>`

Ограничение времени выполнения:

```typescript
const timedFetch = timeout(
  effectful(slowOperation, EffectFlags.Network),
  5000 // 5 секунд
);
```

### Effect Analyzers

#### `analyze(flow): EffectAnalysis`

Анализ эффектов в Flow:

```typescript
const analysis = analyze(myComplexFlow);
console.log(analysis);
// {
//   pure: false,
//   effects: EffectFlags.Read | EffectFlags.Write | EffectFlags.Network,
//   sideEffects: ['readFile', 'writeDb', 'fetch'],
//   async: true,
//   complexity: 'O(n)',
//   performance: { expectedMs: 250, variance: 50 }
// }
```

#### `optimize(flow): EffectFlow`

Оптимизация эффектов:

```typescript
const optimized = optimize(myFlow);
// Автоматически:
// - Группирует батчевые операции
// - Кэширует чистые вычисления
// - Переупорядочивает независимые эффекты
// - Удаляет дублирующиеся эффекты
```

## Практические кейсы

### Кейс 1: Безопасная работа с файловой системой

```typescript
// Определяем эффекты файловой системы
const FileEffects = {
  read: effect({
    id: Symbol('fs.read'),
    flags: EffectFlags.Read | EffectFlags.IO | EffectFlags.Async,
    handler: async (path: string) => {
      return await fs.readFile(path, 'utf-8');
    }
  }),

  write: effect({
    id: Symbol('fs.write'),
    flags: EffectFlags.Write | EffectFlags.IO | EffectFlags.Async,
    handler: async ([path, content]: [string, string]) => {
      await fs.writeFile(path, content);
    }
  }),

  exists: effect({
    id: Symbol('fs.exists'),
    flags: EffectFlags.Read | EffectFlags.IO | EffectFlags.Async,
    handler: async (path: string) => {
      return await fs.exists(path);
    }
  })
};

// Создаем безопасный Flow для копирования файла
const copyFile = flow((source: string, dest: string) =>
  effectful(
    async () => {
      // Проверяем существование источника
      const exists = await FileEffects.exists.handler(source);
      if (!exists) throw new Error(`Source file not found: ${source}`);

      // Читаем содержимое
      const content = await FileEffects.read.handler(source);

      // Записываем в новое место
      await FileEffects.write.handler([dest, content]);

      return { source, dest, size: content.length };
    },
    EffectFlags.Read | EffectFlags.Write | EffectFlags.IO | EffectFlags.Async
  )
);

// Использование с интерпретатором
const interpreter = new EffectInterpreter()
  .register(FileEffects.read)
  .register(FileEffects.write)
  .register(FileEffects.exists);

const result = await interpreter.run(
  copyFile('input.txt', 'output.txt'),
  context()
);
```

### Кейс 2: Транзакционные операции с БД

```typescript
// Эффект транзакции
const transactionEffect = effect({
  id: Symbol('db.transaction'),
  flags: EffectFlags.Write | EffectFlags.Async | EffectFlags.State,
  handler: async (operations: Operation[], ctx: Context) => {
    const connection = await db.connect();
    const transaction = await connection.beginTransaction();

    try {
      const results = [];
      for (const op of operations) {
        results.push(await transaction.execute(op));
      }
      await transaction.commit();
      return results;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  }
});

// Flow с транзакционной семантикой
const transferMoney = effectful(
  async (from: string, to: string, amount: number) => {
    return await transactionEffect.handler([
      { type: 'debit', account: from, amount },
      { type: 'credit', account: to, amount },
      { type: 'log', message: `Transfer ${amount} from ${from} to ${to}` }
    ]);
  },
  EffectFlags.Write | EffectFlags.Async | EffectFlags.State
);
```

### Кейс 3: Кэширование с инвалидацией

```typescript
// Создаем эффект кэширования
class CacheEffect<T> {
  private cache = new Map<string, { value: T; expires: number }>();

  readonly get = effect({
    id: Symbol('cache.get'),
    flags: EffectFlags.Read | EffectFlags.State,
    handler: (key: string): T | undefined => {
      const entry = this.cache.get(key);
      if (!entry) return undefined;

      if (Date.now() > entry.expires) {
        this.cache.delete(key);
        return undefined;
      }

      return entry.value;
    }
  });

  readonly set = effect({
    id: Symbol('cache.set'),
    flags: EffectFlags.Write | EffectFlags.State,
    handler: ([key, value, ttl]: [string, T, number]) => {
      this.cache.set(key, {
        value,
        expires: Date.now() + ttl
      });
    }
  });

  readonly invalidate = effect({
    id: Symbol('cache.invalidate'),
    flags: EffectFlags.Write | EffectFlags.State,
    handler: (pattern: string | RegExp) => {
      const keys = Array.from(this.cache.keys());
      const toDelete = typeof pattern === 'string'
        ? keys.filter(k => k.startsWith(pattern))
        : keys.filter(k => pattern.test(k));

      toDelete.forEach(k => this.cache.delete(k));
      return toDelete.length;
    }
  });
}

// Использование с мемоизацией
const cache = new CacheEffect<any>();

const cachedFetch = <T>(url: string): EffectFlow<void, T> =>
  effectful(
    async () => {
      // Пробуем получить из кэша
      const cached = cache.get.handler(url);
      if (cached) return cached;

      // Если нет, загружаем
      const response = await fetch(url);
      const data = await response.json();

      // Сохраняем в кэш
      cache.set.handler([url, data, 60000]); // TTL 1 минута

      return data;
    },
    EffectFlags.Read | EffectFlags.Write | EffectFlags.State |
    EffectFlags.Network | EffectFlags.Async
  );
```

### Кейс 4: Обработка потоков данных

```typescript
// Эффекты для работы с потоками
const StreamEffects = {
  create: <T>() => effect({
    id: Symbol('stream.create'),
    flags: EffectFlags.State,
    handler: (): ReadableStream<T> => {
      return new ReadableStream<T>();
    }
  }),

  transform: <In, Out>(
    transformer: (chunk: In) => Out
  ) => effect({
    id: Symbol('stream.transform'),
    flags: EffectFlags.Read | EffectFlags.Write | EffectFlags.Async,
    handler: async (stream: ReadableStream<In>): Promise<ReadableStream<Out>> => {
      return stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(transformer(chunk));
          }
        })
      );
    }
  }),

  collect: <T>() => effect({
    id: Symbol('stream.collect'),
    flags: EffectFlags.Read | EffectFlags.Async,
    handler: async (stream: ReadableStream<T>): Promise<T[]> => {
      const reader = stream.getReader();
      const chunks: T[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      return chunks;
    }
  })
};

// Pipeline обработки потока
const processStream = <T, R>(
  source: ReadableStream<T>,
  transformer: (item: T) => R
): EffectFlow<void, R[]> =>
  effectful(
    async () => {
      const transformed = await StreamEffects
        .transform(transformer)
        .handler(source);

      return await StreamEffects
        .collect<R>()
        .handler(transformed);
    },
    EffectFlags.Read | EffectFlags.Write | EffectFlags.Async
  );
```

## Паттерны использования

### Паттерн 1: Effect Sandwich

Изолируйте эффекты в начале и конце, чистая логика в середине:

```typescript
const processData = flow(async (input: Input) => {
  // 1. Эффекты загрузки (нижний слой)
  const loadEffects = parallel(
    effectful(() => loadConfig(), EffectFlags.Read),
    effectful(() => loadData(), EffectFlags.Read | EffectFlags.Network)
  );
  const [config, data] = await loadEffects(input);

  // 2. Чистая обработка (средний слой)
  const pureProcessing = compose(
    pure(normalize),
    pure(validate),
    pure(transform),
    pure(enrich)
  );
  const processed = pureProcessing({ config, data });

  // 3. Эффекты сохранения (верхний слой)
  const saveEffects = sequential(
    effectful(saveToDb, EffectFlags.Write),
    effectful(notifyUsers, EffectFlags.Network),
    effectful(logResults, EffectFlags.IO)
  );
  return await saveEffects(processed);
});
```

### Паттерн 2: Effect Interpreter Pattern

Разделение описания эффектов и их интерпретации:

```typescript
// Описание эффектов
interface AppEffects {
  log: Effect<string, void>;
  fetch: Effect<string, any>;
  save: Effect<any, void>;
}

// Production интерпретатор
const prodInterpreter = new EffectInterpreter<AppEffects>({
  log: (msg) => console.log(msg),
  fetch: (url) => fetch(url).then(r => r.json()),
  save: (data) => db.save(data)
});

// Test интерпретатор
const testInterpreter = new EffectInterpreter<AppEffects>({
  log: jest.fn(),
  fetch: jest.fn().mockResolvedValue({ test: 'data' }),
  save: jest.fn()
});

// Один Flow, разные интерпретации
const app = effectful(/* ... */);
await prodInterpreter.run(app, input);
await testInterpreter.run(app, input);
```

### Паттерн 3: Effect Capability Pattern

Ограничение доступных эффектов через типы:

```typescript
// Определяем возможности
type ReadOnly = EffectFlags.Read;
type WriteOnly = EffectFlags.Write;
type ReadWrite = EffectFlags.Read | EffectFlags.Write;
type NetworkOnly = EffectFlags.Network | EffectFlags.Async;

// Функции с ограниченными возможностями
function readOnlyOperation<T>(): EffectFlow<void, T, ReadOnly> {
  return effectful(/* только чтение */, EffectFlags.Read);
}

function networkOperation<T>(): EffectFlow<void, T, NetworkOnly> {
  return effectful(/* только сеть */, EffectFlags.Network | EffectFlags.Async);
}

// Композиция автоматически объединяет возможности
const combined = compose(
  readOnlyOperation(),
  networkOperation()
);
// Type: EffectFlow<void, T, ReadOnly | NetworkOnly>
```

### Паттерн 4: Gradual Effects

Постепенное добавление эффектов к чистому коду:

```typescript
// Начинаем с чистой функции
const pureCalc = pure((x: number) => x * 2);

// Добавляем логирование
const withLogging = effectful(
  (x: number) => {
    console.log(`Input: ${x}`);
    const result = pureCalc(x);
    console.log(`Output: ${result}`);
    return result;
  },
  EffectFlags.IO
);

// Добавляем кэширование
const withCaching = effectful(
  async (x: number) => {
    const cached = await cache.get(x.toString());
    if (cached) return cached;

    const result = await withLogging(x);
    await cache.set(x.toString(), result);
    return result;
  },
  EffectFlags.IO | EffectFlags.Read | EffectFlags.Write
);

// Добавляем метрики
const withMetrics = effectful(
  async (x: number) => {
    const start = Date.now();
    const result = await withCaching(x);
    await metrics.record('calc_time', Date.now() - start);
    return result;
  },
  EffectFlags.IO | EffectFlags.Read | EffectFlags.Write | EffectFlags.Time
);
```

## Интеграция с экосистемой

### Интеграция с @holon/flow

```typescript
import { flow, compose } from '@holon/flow';
import { effectful, pure, EffectFlags } from '@holon/effects';

// Effects естественно интегрируются с Flow
const pipeline = compose(
  flow((x: number) => x.toString()),           // Обычный flow
  effectful(logValue, EffectFlags.IO),         // Effectful flow
  pure(parseInt),                              // Pure effect flow
  flow((x: number) => x * 2)                   // Снова обычный flow
);
```

### Интеграция с @holon/context

```typescript
import { context } from '@holon/context';
import { effectful, EffectInterpreter } from '@holon/effects';

// Контекст предоставляет интерпретатор
const ctx = context({
  interpreter: new EffectInterpreter()
    .register(Effects.log)
    .register(Effects.readFile)
});

// Effects используют контекст
const withContext = effectful(
  async (input: string, ctx: Context) => {
    const interpreter = ctx.get('interpreter');
    return await interpreter.run(myEffectfulFlow, input);
  },
  EffectFlags.Async
);
```

### Интеграция с модульной системой

```typescript
import { createModule } from '@holon/context';
import { effectsModule } from '@holon/effects';

// Создаем модуль с эффектами
export const databaseModule = createModule({
  name: Symbol.for('database'),
  dependencies: [effectsModule],

  factory: (ctx) => {
    const effects = ctx.getModule(Symbol.for('holon:flow-effects'));

    return {
      db: {
        query: effects.effects.effectful(
          async (sql: string) => /* ... */,
          EffectFlags.Read | EffectFlags.Network | EffectFlags.Async
        ),

        execute: effects.effects.effectful(
          async (sql: string) => /* ... */,
          EffectFlags.Write | EffectFlags.Network | EffectFlags.Async
        )
      }
    };
  }
});
```

## План доработки

### Фаза 1: Базовые улучшения (Sprint 1-2)

#### 1.1 Расширение системы флагов

```typescript
// Добавить новые флаги
export enum EffectFlags {
  // ... существующие флаги ...

  // Системные эффекты
  Process   = 1 << 8,   // Работа с процессами
  Memory    = 1 << 9,   // Управление памятью
  State     = 1 << 10,  // Мутабельное состояние
  Unsafe    = 1 << 11,  // Небезопасные операции

  // Специализированные эффекты
  Database  = 1 << 12,  // БД операции
  Cache     = 1 << 13,  // Кэширование
  Queue     = 1 << 14,  // Очереди
  Stream    = 1 << 15,  // Потоки данных

  // Составные флаги
  FileSystem = Read | Write | IO,
  FullDatabase = Read | Write | Network | Async | Database,
  Pure = None
}
```

#### 1.2 Улучшение Effect Descriptor

```typescript
export interface Effect<T = any, R = any> {
  id: symbol;
  flags: EffectFlags;
  handler: EffectHandler<T, R>;
  cleanup?: (result: R) => void | Promise<void>;

  // Новые поля
  metadata: {
    name: string;
    description?: string;
    category: EffectCategory;
    performance?: {
      expectedMs: number;
      variance: number;
      complexity: 'O(1)' | 'O(n)' | 'O(n²)' | 'O(log n)';
    };
    security?: {
      requiresAuth: boolean;
      permissions: string[];
      sanitization: boolean;
    };
    reliability?: {
      retryable: boolean;
      idempotent: boolean;
      compensatable: boolean;
    };
  };

  // Валидация
  validate?: (value: T, ctx: Context) => boolean | Promise<boolean>;

  // Трансформация
  transform?: (value: T, ctx: Context) => T | Promise<T>;
}
```

#### 1.3 Добавление Effect Combinators

```typescript
// Параллельное выполнение с ограничением
export function parallelLimit<E>(
  limit: number,
  ...effects: EffectFlow<any, any, E>[]
): EffectFlow<any, any[], E>;

// Race с таймаутом
export function raceTimeout<E>(
  effect: EffectFlow<any, any, E>,
  timeoutMs: number,
  fallback?: any
): EffectFlow<any, any, E>;

// Пакетная обработка
export function batch<In, Out, E>(
  effect: EffectFlow<In[], Out[], E>,
  options: BatchOptions
): EffectFlow<In, Out, E>;

// Дебаунс эффектов
export function debounceEffect<E>(
  effect: EffectFlow<any, any, E>,
  delayMs: number
): EffectFlow<any, any, E>;

// Throttle эффектов
export function throttleEffect<E>(
  effect: EffectFlow<any, any, E>,
  limitMs: number
): EffectFlow<any, any, E>;
```

### Фаза 2: Продвинутые возможности (Sprint 3-4)

#### 2.1 Алгебраические эффекты и обработчики

```typescript
// Определение алгебраического эффекта
export class AlgebraicEffect<T, R> {
  constructor(
    public readonly name: string,
    public readonly signature: TypeSignature<T, R>
  ) {}

  // Perform - вызов эффекта
  perform(value: T): R {
    return currentHandler.handle(this, value);
  }

  // Handle - установка обработчика
  handle<In, Out>(
    handler: (value: T, resume: (result: R) => Out) => Out,
    computation: () => In
  ): In {
    return withHandler(this, handler, computation);
  }
}

// Пример использования
const askName = new AlgebraicEffect<void, string>('askName');
const log = new AlgebraicEffect<string, void>('log');

const program = () => {
  const name = askName.perform();
  log.perform(`Hello, ${name}!`);
  return name.length;
};

// Разные обработчики
const result1 = askName.handle(
  (_, resume) => resume('Alice'),
  () => log.handle(
    (msg, resume) => { console.log(msg); resume(); },
    program
  )
);

const result2 = askName.handle(
  (_, resume) => resume('Bob'),
  () => log.handle(
    (msg, resume) => { /* silent */ resume(); },
    program
  )
);
```

#### 2.2 Effect Tracking и Analysis

```typescript
export class EffectTracker {
  private effects: Map<symbol, EffectUsage> = new Map();

  track<T>(effect: Effect<T>): void {
    const usage = this.effects.get(effect.id) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      samples: []
    };

    usage.count++;
    this.effects.set(effect.id, usage);
  }

  analyze(): EffectAnalysisReport {
    return {
      totalEffects: this.effects.size,
      byFrequency: this.getByFrequency(),
      byPerformance: this.getByPerformance(),
      byErrors: this.getByErrors(),
      suggestions: this.generateSuggestions()
    };
  }

  private generateSuggestions(): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Анализ частых эффектов
    const frequent = this.getByFrequency().slice(0, 3);
    if (frequent.some(e => e.flags & EffectFlags.Network)) {
      suggestions.push({
        type: 'performance',
        message: 'Consider batching network requests',
        impact: 'high'
      });
    }

    // Анализ медленных эффектов
    const slow = this.getByPerformance()
      .filter(e => e.avgTime > 100);
    if (slow.length > 0) {
      suggestions.push({
        type: 'performance',
        message: 'Consider caching slow effects',
        effects: slow.map(e => e.name)
      });
    }

    return suggestions;
  }
}
```

#### 2.3 Effect Optimization Engine

```typescript
export class EffectOptimizer {
  optimize<In, Out, E>(
    flow: EffectFlow<In, Out, E>
  ): EffectFlow<In, Out, E> {
    const analysis = this.analyze(flow);

    let optimized = flow;

    // Автоматическая мемоизация чистых функций
    if (analysis.hasPureSegments) {
      optimized = this.memoizePureSegments(optimized);
    }

    // Батчинг сетевых запросов
    if (analysis.hasMultipleNetworkCalls) {
      optimized = this.batchNetworkCalls(optimized);
    }

    // Параллелизация независимых эффектов
    if (analysis.hasIndependentEffects) {
      optimized = this.parallelizeIndependent(optimized);
    }

    // Удаление дублирующихся эффектов
    if (analysis.hasDuplicateEffects) {
      optimized = this.deduplicateEffects(optimized);
    }

    // Кэширование часто используемых результатов
    if (analysis.hasFrequentCalls) {
      optimized = this.addCaching(optimized);
    }

    return optimized;
  }

  private batchNetworkCalls<In, Out, E>(
    flow: EffectFlow<In, Out, E>
  ): EffectFlow<In, Out, E> {
    // Группируем сетевые вызовы
    const batcher = new NetworkBatcher();

    return effectful(
      async (input: In) => {
        // Перехватываем сетевые эффекты
        const originalFetch = globalThis.fetch;
        globalThis.fetch = batcher.fetch.bind(batcher);

        try {
          // Выполняем оригинальный flow
          const result = await flow(input);

          // Отправляем батч
          await batcher.flush();

          return result;
        } finally {
          globalThis.fetch = originalFetch;
        }
      },
      flow.flags
    );
  }
}
```

### Фаза 3: Экосистема и интеграции (Sprint 5-6)

#### 3.1 Стандартная библиотека эффектов

```typescript
// @holon/effects-stdlib
export const StdEffects = {
  // I/O эффекты
  IO: {
    print: effect(/* ... */),
    read: effect(/* ... */),
    prompt: effect(/* ... */)
  },

  // Файловая система
  FS: {
    readFile: effect(/* ... */),
    writeFile: effect(/* ... */),
    readDir: effect(/* ... */),
    mkdir: effect(/* ... */),
    rm: effect(/* ... */)
  },

  // Сеть
  Network: {
    fetch: effect(/* ... */),
    ws: effect(/* ... */),
    tcp: effect(/* ... */),
    udp: effect(/* ... */)
  },

  // База данных
  Database: {
    query: effect(/* ... */),
    execute: effect(/* ... */),
    transaction: effect(/* ... */),
    migrate: effect(/* ... */)
  },

  // Процессы
  Process: {
    spawn: effect(/* ... */),
    exec: effect(/* ... */),
    fork: effect(/* ... */),
    kill: effect(/* ... */)
  },

  // Криптография
  Crypto: {
    hash: effect(/* ... */),
    encrypt: effect(/* ... */),
    decrypt: effect(/* ... */),
    sign: effect(/* ... */),
    verify: effect(/* ... */)
  }
};
```

#### 3.2 Effect Testing Framework

```typescript
// @holon/effects-test
export class EffectTestHarness {
  private expectations = new Map<symbol, Expectation[]>();
  private calls = new Map<symbol, Call[]>();

  expect(effect: Effect): EffectExpectation {
    return new EffectExpectation(this, effect);
  }

  mock<T, R>(effect: Effect<T, R>): MockEffect<T, R> {
    return new MockEffect(effect, this);
  }

  spy<T, R>(effect: Effect<T, R>): SpyEffect<T, R> {
    return new SpyEffect(effect, this);
  }

  stub<T, R>(effect: Effect<T, R>): StubEffect<T, R> {
    return new StubEffect(effect, this);
  }

  verify(): void {
    for (const [effectId, expectations] of this.expectations) {
      const calls = this.calls.get(effectId) || [];

      for (const expectation of expectations) {
        expectation.verify(calls);
      }
    }
  }
}

// Использование в тестах
test('should handle effects correctly', async () => {
  const harness = new EffectTestHarness();

  // Настраиваем моки
  harness.mock(Effects.readFile)
    .onCall(1).returns('first content')
    .onCall(2).returns('second content')
    .otherwise().throws(new Error('File not found'));

  // Настраиваем ожидания
  harness.expect(Effects.writeFile)
    .toBeCalledTimes(2)
    .toBeCalledWith(['output.txt', 'processed']);

  // Запускаем тест
  const interpreter = harness.createInterpreter();
  await interpreter.run(myEffectfulFlow, input);

  // Проверяем
  harness.verify();
});
```

#### 3.3 Effect DevTools

```typescript
// Browser DevTools Extension
export class EffectDevTools {
  private timeline: EffectEvent[] = [];
  private enabled = false;

  connect(): void {
    if (typeof window !== 'undefined' && window.__HOLON_DEVTOOLS__) {
      this.enabled = true;
      window.__HOLON_DEVTOOLS__.effects = this;
    }
  }

  record(event: EffectEvent): void {
    if (!this.enabled) return;

    this.timeline.push({
      ...event,
      timestamp: Date.now(),
      stack: new Error().stack
    });

    // Отправляем в DevTools
    window.postMessage({
      type: 'HOLON_EFFECT',
      payload: event
    }, '*');
  }

  getTimeline(): EffectTimeline {
    return {
      events: this.timeline,
      duration: this.calculateDuration(),
      effects: this.groupByEffect(),
      waterfall: this.generateWaterfall()
    };
  }

  generateFlameGraph(): FlameGraph {
    // Генерация flame graph для визуализации
    return new FlameGraphGenerator(this.timeline).generate();
  }
}
```

### Фаза 4: Продвинутые оптимизации (Sprint 7-8)

#### 4.1 JIT компиляция эффектов

```typescript
export class EffectJIT {
  private compiledEffects = new Map<string, CompiledEffect>();

  compile<In, Out, E>(
    flow: EffectFlow<In, Out, E>
  ): CompiledEffectFlow<In, Out, E> {
    const id = this.getFlowId(flow);

    if (this.compiledEffects.has(id)) {
      return this.compiledEffects.get(id)!;
    }

    // Анализируем flow
    const ast = this.parseFlow(flow);
    const optimized = this.optimizeAST(ast);

    // Генерируем оптимизированный код
    const code = this.generateCode(optimized);
    const compiled = new Function('input', 'context', code);

    // Кэшируем
    this.compiledEffects.set(id, compiled);

    return compiled;
  }

  private optimizeAST(ast: AST): AST {
    // Constant folding
    ast = this.constantFolding(ast);

    // Dead code elimination
    ast = this.eliminateDeadCode(ast);

    // Effect fusion
    ast = this.fuseEffects(ast);

    // Loop unrolling для известных границ
    ast = this.unrollLoops(ast);

    return ast;
  }
}
```

#### 4.2 Effect Scheduling

```typescript
export class EffectScheduler {
  private queue: PriorityQueue<ScheduledEffect> = new PriorityQueue();
  private running = new Set<symbol>();
  private maxConcurrent = navigator.hardwareConcurrency || 4;

  schedule<T, R>(
    effect: Effect<T, R>,
    value: T,
    priority: Priority = Priority.Normal
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const scheduled: ScheduledEffect = {
        effect,
        value,
        priority,
        resolve,
        reject,
        addedAt: Date.now()
      };

      this.queue.enqueue(scheduled, priority);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    while (
      this.queue.size > 0 &&
      this.running.size < this.maxConcurrent
    ) {
      const next = this.queue.dequeue()!;
      this.running.add(next.effect.id);

      try {
        const result = await this.execute(next);
        next.resolve(result);
      } catch (error) {
        next.reject(error);
      } finally {
        this.running.delete(next.effect.id);
        this.processQueue(); // Продолжаем обработку
      }
    }
  }

  private async execute(scheduled: ScheduledEffect): Promise<any> {
    // Адаптивная приоритизация
    if (Date.now() - scheduled.addedAt > 1000) {
      // Повышаем приоритет долго ждущих
      scheduled.priority = Priority.High;
    }

    // Выполняем эффект
    return scheduled.effect.handler(
      scheduled.value,
      this.createContext(scheduled)
    );
  }
}
```

### Фаза 5: Интеграция с внешними системами (Sprint 9-10)

#### 5.1 React интеграция

```typescript
// @holon/effects-react
export function useEffect<T, R>(
  effect: Effect<T, R>,
  deps?: DependencyList
): [R | undefined, boolean, Error | undefined] {
  const [result, setResult] = useState<R>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  useReactEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(undefined);

      try {
        const res = await effect.handler(deps?.[0], getCurrentContext());
        if (!cancelled) {
          setResult(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      effect.cleanup?.(result);
    };
  }, deps);

  return [result, loading, error];
}

// Использование
function UserProfile({ userId }: Props) {
  const [user, loading, error] = useEffect(
    Effects.fetchUser,
    [userId]
  );

  if (loading) return <Spinner />;
  if (error) return <Error error={error} />;
  return <Profile user={user} />;
}
```

#### 5.2 GraphQL интеграция

```typescript
// @holon/effects-graphql
export class GraphQLEffects {
  static query = <T>(query: DocumentNode) =>
    effect({
      id: Symbol('graphql.query'),
      flags: EffectFlags.Network | EffectFlags.Read | EffectFlags.Async,
      handler: async (variables: any) => {
        const client = getApolloClient();
        const result = await client.query<T>({
          query,
          variables
        });
        return result.data;
      }
    });

  static mutation = <T>(mutation: DocumentNode) =>
    effect({
      id: Symbol('graphql.mutation'),
      flags: EffectFlags.Network | EffectFlags.Write | EffectFlags.Async,
      handler: async (variables: any) => {
        const client = getApolloClient();
        const result = await client.mutate<T>({
          mutation,
          variables
        });
        return result.data;
      }
    });

  static subscription = <T>(subscription: DocumentNode) =>
    effect({
      id: Symbol('graphql.subscription'),
      flags: EffectFlags.Network | EffectFlags.Read | EffectFlags.Async | EffectFlags.Stream,
      handler: (variables: any) => {
        const client = getApolloClient();
        return client.subscribe<T>({
          query: subscription,
          variables
        });
      }
    });
}
```

### Метрики успеха

1. **Производительность**
   - Overhead эффектов < 5% от базового Flow
   - JIT оптимизация дает 20-30% прироста на горячих путях
   - Батчинг сокращает сетевые вызовы на 40-60%

2. **Качество кода**
   - 100% type coverage
   - 95%+ test coverage
   - 0 runtime errors в production

3. **Developer Experience**
   - Время до первого эффекта < 5 минут
   - Автокомплит для всех эффектов
   - Понятные сообщения об ошибках

4. **Adoption**
   - 80% новых проектов используют эффекты
   - Миграция существующего кода без breaking changes
   - Положительные отзывы от community

---

## Заключение

Модуль `@holon/effects` представляет собой мощную и гибкую систему управления побочными эффектами, которая органично интегрируется в экосистему Holon Flow. Предложенный план развития обеспечит:

1. **Полноту** - покрытие всех типов эффектов
2. **Производительность** - оптимизации на всех уровнях
3. **Удобство** - простой и интуитивный API
4. **Надежность** - строгая типизация и тестируемость
5. **Масштабируемость** - от простых до сложных систем

Реализация плана позволит создать эталонную систему эффектов, которая станет стандартом де-факто для функционального программирования в TypeScript/JavaScript экосистеме.