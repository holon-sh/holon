# Приложение B: API Reference

## B.1 Core API

### `flow<In, Out>(fn)`

Создаёт новый Flow из функции.

#### Сигнатура
```typescript
function flow<In, Out>(
  fn: (input: In) => Out | Promise<Out>
): Flow<In, Out>
```

#### Параметры
- `fn: Function` - Функция преобразования, может быть синхронной или асинхронной

#### Возвращает
- `Flow<In, Out>` - Flow объект с методом `.pipe()`

#### Примеры
```typescript
// Синхронный Flow
const increment = flow((x: number) => x + 1);

// Асинхронный Flow
const fetchUser = flow(async (id: string) => {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
});

// Flow с деструктуризацией
const processUser = flow(({ name, age }: User) => ({
  displayName: name.toUpperCase(),
  isAdult: age >= 18
}));
```

### `Flow<In, Out>` Interface

Основной интерфейс для всех Flow.

#### Свойства

##### `(input: In): Out | Promise<Out>`
Функция выполнения Flow.

```typescript
const double = flow((x: number) => x * 2);
const result = double(5); // 10
```

##### `pipe<Next>(next: Flow<Out, Next>): Flow<In, Next>`
Композиция с другим Flow.

```typescript
const increment = flow((x: number) => x + 1);
const double = flow((x: number) => x * 2);
const combined = increment.pipe(double);
combined(5); // 12
```

##### `meta?: FlowMeta`
Опциональные метаданные для оптимизации и отладки.

```typescript
interface FlowMeta {
  name?: string;
  description?: string;
  effects?: Effect;
  performance?: {
    avgTime?: number;
    calls?: number;
  };
  source?: {
    file?: string;
    line?: number;
  };
}
```

---

## B.2 Context API

### `context(initial?)`

Создаёт новый иммутабельный контекст.

#### Сигнатура
```typescript
function context(initial?: object): Context
```

#### Параметры
- `initial?: object` - Начальные значения контекста

#### Возвращает
- `Context` - Иммутабельный контекст

#### Примеры
```typescript
// Пустой контекст
const ctx = context();

// Контекст с начальными значениями
const ctx = context({
  user: { id: '123', name: 'Alice' },
  settings: { theme: 'dark' }
});
```

### `Context` Interface

Иммутабельный контекст для dependency injection.

#### Методы

##### `with<T>(extensions: T): Context & T`
Создаёт новый контекст с дополнительными свойствами.

```typescript
const ctx = context();
const ctxWithDb = ctx.with({ db: database });
const ctxWithLogger = ctxWithDb.with({ log: logger });
```

##### `get<T>(key: string | symbol): T | undefined`
Получает значение из контекста.

```typescript
const userId = ctx.get<string>('userId');
const config = ctx.get<Config>(Symbol.for('config'));
```

##### `run<In, Out>(flow: Flow<In, Out>, input: In): Promise<Out>`
Выполняет Flow с данным контекстом.

```typescript
const result = await ctx.run(processData, inputData);
```

##### `keys(): (string | symbol)[]`
Возвращает все ключи контекста.

```typescript
const keys = ctx.keys(); // ['userId', 'theme', Symbol.for('config')]
```

##### `has(key: string | symbol): boolean`
Проверяет наличие ключа в контексте.

```typescript
if (ctx.has('userId')) {
  // userId exists
}
```

##### `fork(): Context`
Создаёт дочерний контекст с наследованием.

```typescript
const childCtx = ctx.fork();
const enhanced = childCtx.with({ additional: 'value' });
```

##### `freeze(): Context`
Замораживает контекст (предотвращает модификации).

```typescript
const frozen = ctx.freeze();
// frozen.with({ new: 'value' }); // Throws error
```

##### `delete(key: string | symbol): Context`
Удаляет ключ из контекста (возвращает новый контекст).

```typescript
const withoutToken = ctx.delete('authToken');
```

##### `clear(): Context`
Очищает все ключи (возвращает пустой контекст).

```typescript
const empty = ctx.clear();
```

##### `entries(): [string | symbol, unknown][]`
Возвращает все пары ключ-значение.

```typescript
const entries = ctx.entries();
// [['userId', '123'], ['theme', 'dark'], [Symbol.for('config'), {...}]]
```

##### `values(): unknown[]`
Возвращает все значения контекста.

```typescript
const values = ctx.values();
// ['123', 'dark', {...}]
```

##### `merge(...contexts: Context[]): Context`
Объединяет несколько контекстов (последующие перезаписывают предыдущие).

```typescript
const merged = defaultCtx.merge(tenantCtx, userCtx);
```

##### `clone(): Context`
Создаёт точную копию без родительской связи.

```typescript
const cloned = ctx.clone();
// Независимая копия со всеми значениями
```

##### `toObject(): Record<string | symbol, unknown>`
Преобразует в обычный объект (для сериализации).

```typescript
const obj = ctx.toObject();
const json = JSON.stringify(obj);
```

### `ModularContext` Interface

Расширенный контекст с поддержкой модулей.

#### Методы

##### `use<T>(module: Module<T>): ModularContext & T`
Загружает модуль в контекст.

```typescript
const ctx = context()
  .use(logging)
  .use(database)
  .use(metrics);
```

---

## B.3 Effects API

### `Effect` Enum

Битовые флаги для описания эффектов.

```typescript
export const enum Effect {
  None     = 0,        // Чистая функция
  Read     = 1 << 0,   // Чтение состояния
  Write    = 1 << 1,   // Изменение состояния
  Async    = 1 << 2,   // Асинхронная операция
  Error    = 1 << 3,   // Может выбросить ошибку
  IO       = 1 << 4,   // Операции ввода-вывода
  Random   = 1 << 5,   // Недетерминированность
  Network  = 1 << 6,   // Сетевые операции
}
```

#### Комбинирование эффектов
```typescript
const effects = Effect.Read | Effect.Async | Effect.Network;
```

### `effectful<In, Out, E>(fn, effects)`

Создаёт Flow с явными эффектами.

#### Сигнатура
```typescript
function effectful<In, Out, E extends Effect>(
  fn: (input: In) => Out | Promise<Out>,
  effects: E
): EffectfulFlow<In, Out, E>
```

#### Примеры
```typescript
// Чистая функция
const pure = effectful(
  (x: number) => x * 2,
  Effect.None
);

// Функция с IO
const readFile = effectful(
  (path: string) => fs.readFileSync(path, 'utf-8'),
  Effect.Read | Effect.IO
);

// Сетевой запрос
const fetchData = effectful(
  async (url: string) => {
    const res = await fetch(url);
    return res.json();
  },
  Effect.Async | Effect.Network | Effect.Error
);
```

### `EffectfulFlow<In, Out, E>` Interface

Flow с информацией об эффектах.

#### Свойства
- `effects: E` - Битовая маска эффектов

#### Методы
Наследует все методы от `Flow<In, Out>`

---

## B.4 Module API

### `module<T>(name, factory, options?)`

Создаёт модуль для расширения контекста.

#### Сигнатура
```typescript
function module<T extends object>(
  name: string | symbol,
  factory: (ctx: Context) => T | Promise<T>,
  options?: {
    version?: string;
    dependencies?: (string | symbol)[];
  }
): Module<T>
```

#### Параметры
- `name` - Уникальное имя модуля
- `factory` - Функция создания расширений
- `options` - Опциональные настройки
  - `version` - Версия модуля
  - `dependencies` - Список зависимостей

#### Примеры
```typescript
// Простой модуль
const logger = module(
  'logger',
  () => ({ log: console })
);

// Модуль с зависимостями
const userService = module(
  'userService',
  (ctx) => ({
    getUser: flow(async (id: string) => {
      return await ctx.db.users.findById(id);
    })
  }),
  { dependencies: ['database'] }
);

// Асинхронная инициализация
const database = module(
  'database',
  async (ctx) => {
    const connection = await createConnection(ctx.env.DB_URL);
    return { db: connection };
  }
);
```

### `Module<T>` Interface

Интерфейс модуля.

#### Свойства
- `name: string | symbol` - Имя модуля
- `version?: string` - Версия
- `dependencies?: (string | symbol)[]` - Зависимости

#### Методы
- `(ctx: Context): T | Promise<T>` - Фабрика расширений

---

## B.5 Composition API

### `pipe(...flows)`

Последовательная композиция Flow.

```typescript
function pipe<A, B, C>(
  f1: Flow<A, B>,
  f2: Flow<B, C>
): Flow<A, C>

function pipe<A, B, C, D>(
  f1: Flow<A, B>,
  f2: Flow<B, C>,
  f3: Flow<C, D>
): Flow<A, D>
// ... перегрузки до 10 функций
```

#### Примеры
```typescript
const pipeline = pipe(
  validate,
  transform,
  save
);
```

### `parallel(...flows)`

Параллельное выполнение Flow.

```typescript
function parallel<A, B>(
  flows: [Flow<A, B>, ...Flow<A, B>[]]
): Flow<A[], B[]>
```

#### Примеры
```typescript
const processAll = parallel(
  processItem,
  processItem,
  processItem
);

const results = await processAll([item1, item2, item3]);
```

### `race(...flows)`

Возвращает результат первого завершившегося Flow.

```typescript
function race<In, Out>(
  ...flows: Flow<In, Out>[]
): Flow<In, Out>
```

#### Примеры
```typescript
const fastest = race(
  fastEndpoint,
  mediumEndpoint,
  slowEndpoint
);
```

### `retry(flow, options)`

Добавляет логику повторов к Flow.

```typescript
function retry<In, Out>(
  flow: Flow<In, Out>,
  options?: {
    attempts?: number;
    delay?: number;
    backoff?: 'linear' | 'exponential' | 'fibonacci';
    shouldRetry?: (error: Error, attempt: number) => boolean;
  }
): Flow<In, Out>
```

#### Примеры
```typescript
const resilient = retry(fetchData, {
  attempts: 3,
  delay: 1000,
  backoff: 'exponential',
  shouldRetry: (err) => err.code !== 'FATAL'
});
```

### `timeout(flow, ms)`

Добавляет таймаут к Flow.

```typescript
function timeout<In, Out>(
  flow: Flow<In, Out>,
  ms: number
): Flow<In, Out>
```

#### Примеры
```typescript
const withTimeout = timeout(slowOperation, 5000);
```

---

## B.6 Utility API

### `memoize(flow, options?)`

Кеширует результаты Flow.

```typescript
function memoize<In, Out>(
  flow: Flow<In, Out>,
  options?: {
    key?: (input: In) => string;
    ttl?: number;
    max?: number;
  }
): Flow<In, Out>
```

#### Примеры
```typescript
const cached = memoize(expensiveComputation, {
  ttl: 60000,  // 1 минута
  max: 100     // максимум 100 записей
});
```

### `throttle(flow, ms)`

Ограничивает частоту вызовов Flow.

```typescript
function throttle<In, Out>(
  flow: Flow<In, Out>,
  ms: number
): Flow<In, Out>
```

### `debounce(flow, ms)`

Откладывает выполнение Flow до прекращения вызовов.

```typescript
function debounce<In, Out>(
  flow: Flow<In, Out>,
  ms: number
): Flow<In, Out>
```

### `batch(flow, options)`

Группирует вызовы Flow в батчи.

```typescript
function batch<In, Out>(
  flow: Flow<In[], Out[]>,
  options?: {
    maxSize?: number;
    maxWait?: number;
  }
): Flow<In, Out>
```

#### Примеры
```typescript
const batchedSave = batch(saveMany, {
  maxSize: 100,
  maxWait: 50
});

// Вызовы группируются автоматически
await Promise.all([
  batchedSave(item1),
  batchedSave(item2),
  batchedSave(item3)
]);
```

---

## B.7 Testing API

### `mock<In, Out>(implementation)`

Создаёт mock-версию Flow для тестирования.

```typescript
function mock<In, Out>(
  implementation: (input: In) => Out
): MockFlow<In, Out>
```

#### Примеры
```typescript
const mockFetch = mock((url: string) => ({
  status: 200,
  data: { id: 1, name: 'Test' }
}));

// Проверка вызовов
expect(mockFetch.calls).toHaveLength(1);
expect(mockFetch.lastCall.input).toBe('/api/users/1');
```

### `spy(flow)`

Создаёт шпиона для отслеживания вызовов Flow.

```typescript
function spy<In, Out>(
  flow: Flow<In, Out>
): SpyFlow<In, Out>
```

### `stub<In, Out>()`

Создаёт заглушку Flow.

```typescript
function stub<In, Out>(): StubFlow<In, Out>
```

#### Примеры
```typescript
const stubbed = stub<string, number>();
stubbed.returns(42);
stubbed.throws(new Error('Test error'));
stubbed.resolves(100); // для async
```

---

## B.8 Advanced API

### `contract(flow)`

Создаёт Flow с контрактами.

```typescript
function contract<In, Out>(
  flow: Flow<In, Out>
): ContractBuilder<In, Out>
```

#### Примеры
```typescript
const safe = contract(divide)
  .requires((input) => input.divisor !== 0)
  .ensures((input, output) => !isNaN(output))
  .invariant((state) => state.total >= 0)
  .build();
```

### `sandbox(flow, permissions)`

Выполняет Flow в изолированной среде.

```typescript
function sandbox<In, Out>(
  flow: Flow<In, Out>,
  permissions: {
    memory?: string;
    cpu?: string;
    timeout?: number;
    network?: boolean;
    filesystem?: boolean;
  }
): Flow<In, Out>
```

### `trace(flow, name?)`

Добавляет трассировку к Flow.

```typescript
function trace<In, Out>(
  flow: Flow<In, Out>,
  name?: string
): Flow<In, Out>
```

### `profile(flow)`

Профилирует выполнение Flow.

```typescript
function profile<In, Out>(
  flow: Flow<In, Out>
): ProfiledFlow<In, Out>
```

#### Примеры
```typescript
const profiled = profile(complexOperation);
await profiled(input);

console.log(profiled.stats);
// {
//   calls: 100,
//   totalTime: 5234,
//   avgTime: 52.34,
//   minTime: 10,
//   maxTime: 200
// }
```

---

## B.9 Quantum API (Experimental)

### `superposition(branches)`

Создаёт квантовую суперпозицию Flow.

```typescript
function superposition<In, Out>(
  branches: Array<{
    amplitude: Complex;
    flow: Flow<In, Out>;
  }>
): QuantumFlow<In, Out>
```

### `entangle(flow1, flow2)`

Создаёт запутанные Flow.

```typescript
function entangle<A, B, C>(
  flow1: Flow<A, B>,
  flow2: Flow<A, C>
): Flow<A, [B, C]>
```

### `quantum(flow)`

Преобразует классический Flow в квантовый.

```typescript
function quantum<In, Out>(
  flow: Flow<In, Out>
): QuantumFlow<In, Out>
```

---

## B.10 Type Utilities

### `FlowInput<F>`

Извлекает тип входных данных Flow.

```typescript
type FlowInput<F> = F extends Flow<infer In, any> ? In : never;
```

### `FlowOutput<F>`

Извлекает тип выходных данных Flow.

```typescript
type FlowOutput<F> = F extends Flow<any, infer Out> ? Out : never;
```

### `FlowEffects<F>`

Извлекает эффекты Flow.

```typescript
type FlowEffects<F> = F extends EffectfulFlow<any, any, infer E> ? E : Effect.None;
```

### `PureFlow<In, Out>`

Тип для чистых функций.

```typescript
type PureFlow<In, Out> = EffectfulFlow<In, Out, Effect.None>;
```

### `AsyncFlow<In, Out>`

Тип для асинхронных Flow.

```typescript
type AsyncFlow<In, Out> = EffectfulFlow<In, Out, Effect.Async>;
```

---

## B.11 Константы и Конфигурация

### `VERSION`

Версия Holon Flow.

```typescript
export const VERSION = '10.0.0';
```

### `DEFAULT_CONTEXT`

Контекст по умолчанию.

```typescript
export const DEFAULT_CONTEXT = context({
  env: process.env,
  signal: new AbortController().signal
});
```

### `configure(options)`

Глобальная конфигурация.

```typescript
function configure(options: {
  defaultTimeout?: number;
  enableProfiling?: boolean;
  enableTracing?: boolean;
  optimizationLevel?: 0 | 1 | 2 | 3;
  errorHandler?: (error: Error) => void;
}): void
```

---

## B.12 Error Types

### `FlowError`

Базовый класс ошибок Flow.

```typescript
class FlowError extends Error {
  constructor(
    message: string,
    public code: string,
    public flow?: Flow<any, any>
  ) {
    super(message);
  }
}
```

### `CompositionError`

Ошибка композиции Flow.

```typescript
class CompositionError extends FlowError {
  constructor(message: string, flows: Flow<any, any>[]) {
    super(message, 'COMPOSITION_ERROR');
  }
}
```

### `EffectViolationError`

Нарушение ограничений эффектов.

```typescript
class EffectViolationError extends FlowError {
  constructor(
    expected: Effect,
    actual: Effect
  ) {
    super(
      `Effect violation: expected ${expected}, got ${actual}`,
      'EFFECT_VIOLATION'
    );
  }
}
```

### `TimeoutError`

Превышение времени выполнения.

```typescript
class TimeoutError extends FlowError {
  constructor(ms: number) {
    super(`Flow timed out after ${ms}ms`, 'TIMEOUT');
  }
}
```

---

Это полный API Reference для Holon Flow, охватывающий все аспекты системы от базовых функций до экспериментальных квантовых возможностей.