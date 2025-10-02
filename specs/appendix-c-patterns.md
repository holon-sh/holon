# Приложение C: Каталог Паттернов Holon Flow

## C.1 Базовые Паттерны Композиции

### Pipe Pattern (Последовательная Композиция)

```typescript
/**
 * Проблема: Нужно выполнить серию преобразований последовательно
 * Решение: Использовать .pipe() для цепочки Flow
 */

const processData = flow((data: RawData) => data)
  .pipe(validate)      // Валидация
  .pipe(normalize)     // Нормализация
  .pipe(enrich)        // Обогащение
  .pipe(transform)     // Трансформация
  .pipe(save);         // Сохранение

// Использование
const result = await processData(rawData);
```

### Parallel Pattern (Параллельная Композиция)

```typescript
/**
 * Проблема: Нужно выполнить независимые операции параллельно
 * Решение: Использовать Promise.all с массивом Flow
 */

const parallel = flow(async (items: Item[]) => {
  const results = await Promise.all(
    items.map(item => processItem(item))
  );
  return results;
});

// Вариант с разными Flow для разных данных
const multiParallel = flow(async (data: ComplexData) => {
  const [users, orders, products] = await Promise.all([
    fetchUsers(data.userIds),
    fetchOrders(data.orderIds),
    fetchProducts(data.productIds)
  ]);

  return { users, orders, products };
});
```

### Conditional Pattern (Условная Композиция)

```typescript
/**
 * Проблема: Нужно выбрать Flow в зависимости от условия
 * Решение: Использовать условные операторы внутри Flow
 */

const conditional = flow((request: Request) => {
  // Простое условие
  if (request.type === 'premium') {
    return premiumFlow(request);
  } else {
    return standardFlow(request);
  }
});

// Паттерн с таблицей маршрутизации
const router = flow((request: Request) => {
  const routes: Record<string, Flow<Request, Response>> = {
    'GET /users': getUsersFlow,
    'POST /users': createUserFlow,
    'PUT /users/:id': updateUserFlow,
    'DELETE /users/:id': deleteUserFlow
  };

  const handler = routes[`${request.method} ${request.path}`];
  if (!handler) {
    throw new NotFoundError();
  }

  return handler(request);
});
```

### Recursive Pattern (Рекурсивная Композиция)

```typescript
/**
 * Проблема: Нужно обработать древовидную или рекурсивную структуру
 * Решение: Flow может вызывать сам себя
 */

interface TreeNode {
  value: number;
  children?: TreeNode[];
}

const sumTree: Flow<TreeNode, number> = flow((node: TreeNode) => {
  let sum = node.value;

  if (node.children) {
    for (const child of node.children) {
      sum += sumTree(child);
    }
  }

  return sum;
});

// Хвостовая рекурсия для оптимизации
const factorial = flow((n: number, acc = 1): number => {
  if (n <= 1) return acc;
  return factorial(n - 1, n * acc);
});
```

## C.2 Паттерны Обработки Ошибок

### Try-Catch Pattern

```typescript
/**
 * Проблема: Нужно обработать возможные ошибки
 * Решение: Обернуть Flow в try-catch
 */

const safe = <In, Out>(f: Flow<In, Out>): Flow<In, Out | Error> =>
  flow(async (input: In) => {
    try {
      return await f(input);
    } catch (error) {
      console.error('Flow failed:', error);
      return error as Error;
    }
  });

// Использование
const safeOperation = safe(riskyOperation);
```

### Result Pattern

```typescript
/**
 * Проблема: Нужно явно обрабатывать успех и неудачу
 * Решение: Использовать Result тип
 */

type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

const resultFlow = flow(async (input: string): Promise<Result<Data>> => {
  try {
    const data = await fetchData(input);
    return { ok: true, value: data };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
});

// Комбинатор для Result
const mapResult = <T, U, E>(
  f: (value: T) => U
): Flow<Result<T, E>, Result<U, E>> =>
  flow((result) => {
    if (result.ok) {
      return { ok: true, value: f(result.value) };
    }
    return result;
  });
```

### Retry Pattern

```typescript
/**
 * Проблема: Нужно повторить операцию при неудаче
 * Решение: Обернуть Flow в retry логику
 */

const retry = <In, Out>(
  f: Flow<In, Out>,
  options: {
    attempts?: number;
    delay?: number;
    backoff?: 'linear' | 'exponential';
  } = {}
): Flow<In, Out> => {
  const { attempts = 3, delay = 1000, backoff = 'exponential' } = options;

  return flow(async (input: In) => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await f(input);
      } catch (error) {
        lastError = error as Error;

        if (attempt < attempts - 1) {
          const waitTime = backoff === 'exponential'
            ? delay * Math.pow(2, attempt)
            : delay * (attempt + 1);

          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError;
  });
};
```

### Circuit Breaker Pattern

```typescript
/**
 * Проблема: Нужно предотвратить каскадные сбои
 * Решение: Использовать Circuit Breaker
 */

class CircuitBreaker<In, Out> {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private flow: Flow<In, Out>,
    private threshold = 5,
    private timeout = 60000
  ) {}

  execute: Flow<In, Out> = flow(async (input: In) => {
    // Проверяем состояние
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await this.flow(input);

      // Успех - сбрасываем счётчик
      if (this.state === 'half-open') {
        this.state = 'closed';
      }
      this.failures = 0;

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
      }

      throw error;
    }
  });
}
```

## C.3 Паттерны Управления Состоянием

### State Machine Pattern

```typescript
/**
 * Проблема: Нужно управлять сложными переходами состояний
 * Решение: Реализовать конечный автомат через Flow
 */

type State = 'idle' | 'loading' | 'success' | 'error';
type Event = { type: 'FETCH' } | { type: 'SUCCESS' } | { type: 'FAILURE' };

const stateMachine = flow((
  currentState: State,
  event: Event
): State => {
  switch (currentState) {
    case 'idle':
      if (event.type === 'FETCH') return 'loading';
      break;

    case 'loading':
      if (event.type === 'SUCCESS') return 'success';
      if (event.type === 'FAILURE') return 'error';
      break;

    case 'success':
    case 'error':
      if (event.type === 'FETCH') return 'loading';
      break;
  }

  return currentState;
});
```

### Event Sourcing Pattern

```typescript
/**
 * Проблема: Нужно сохранять полную историю изменений
 * Решение: Хранить события вместо состояния
 */

interface Event {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}

const eventStore = flow((ctx: Context & { db: any }) => ({
  // Добавление события
  append: flow(async (event: Event) => {
    await ctx.db.events.insert(event);
    return event;
  }),

  // Восстановление состояния из событий
  replay: flow(async (aggregateId: string) => {
    const events = await ctx.db.events.find({ aggregateId });

    return events.reduce((state, event) => {
      return applyEvent(state, event);
    }, initialState);
  }),

  // Получение событий за период
  getEvents: flow(async (from: Date, to: Date) => {
    return await ctx.db.events.find({
      timestamp: { $gte: from, $lte: to }
    });
  })
}));
```

### Command Pattern

```typescript
/**
 * Проблема: Нужно инкапсулировать действия как объекты
 * Решение: Представить команды как Flow
 */

interface Command<T = any> {
  type: string;
  payload: T;
}

const commandHandler = flow((ctx: Context) => {
  const handlers: Record<string, Flow<any, any>> = {
    CREATE_USER: createUserFlow,
    UPDATE_USER: updateUserFlow,
    DELETE_USER: deleteUserFlow
  };

  return flow(async (command: Command) => {
    const handler = handlers[command.type];

    if (!handler) {
      throw new Error(`Unknown command: ${command.type}`);
    }

    // Логирование
    ctx.log.info(`Executing command: ${command.type}`);

    // Выполнение
    const result = await handler(command.payload);

    // Аудит
    await ctx.audit.record(command, result);

    return result;
  });
});
```

## C.4 Паттерны Интеграции

### Adapter Pattern

```typescript
/**
 * Проблема: Нужно адаптировать внешний API к нашему интерфейсу
 * Решение: Создать Flow-адаптер
 */

// Внешний API с другим интерфейсом
interface ExternalAPI {
  fetchUserData(userId: number): Promise<{
    user_id: number;
    user_name: string;
    user_email: string;
  }>;
}

// Наш интерфейс
interface User {
  id: string;
  name: string;
  email: string;
}

const adaptExternalAPI = (api: ExternalAPI): Flow<string, User> =>
  flow(async (userId: string) => {
    const external = await api.fetchUserData(parseInt(userId));

    return {
      id: external.user_id.toString(),
      name: external.user_name,
      email: external.user_email
    };
  });
```

### Gateway Pattern

```typescript
/**
 * Проблема: Нужна единая точка входа для множества сервисов
 * Решение: API Gateway как Flow
 */

const apiGateway = flow((ctx: GatewayContext) => {
  const services = {
    users: userService(ctx),
    orders: orderService(ctx),
    products: productService(ctx)
  };

  return flow(async (request: Request) => {
    // Аутентификация
    const user = await authenticate(request);

    // Авторизация
    await authorize(user, request);

    // Маршрутизация
    const [service, method] = parseRoute(request.path);

    if (!services[service]) {
      throw new NotFoundError();
    }

    // Rate limiting
    await rateLimit(user, service);

    // Вызов сервиса
    const result = await services[service][method](request);

    // Логирование
    await logRequest(request, result);

    return result;
  });
});
```

### Facade Pattern

```typescript
/**
 * Проблема: Нужно упростить сложный интерфейс
 * Решение: Создать упрощённый Flow-фасад
 */

const complexSystem = {
  initializeConnection: flow(/* ... */),
  authenticateUser: flow(/* ... */),
  fetchUserData: flow(/* ... */),
  processUserData: flow(/* ... */),
  formatResponse: flow(/* ... */),
  closeConnection: flow(/* ... */)
};

// Простой фасад
const simpleFacade = flow(async (userId: string) => {
  const conn = await complexSystem.initializeConnection();

  try {
    await complexSystem.authenticateUser(conn);
    const data = await complexSystem.fetchUserData(conn, userId);
    const processed = await complexSystem.processUserData(data);
    return await complexSystem.formatResponse(processed);
  } finally {
    await complexSystem.closeConnection(conn);
  }
});
```

## C.5 Паттерны Производительности

### Memoization Pattern

```typescript
/**
 * Проблема: Повторные вычисления для одинаковых входов
 * Решение: Кешировать результаты
 */

const memoize = <In, Out>(
  f: Flow<In, Out>,
  keyFn: (input: In) => string = JSON.stringify
): Flow<In, Out> => {
  const cache = new Map<string, Out>();

  return flow(async (input: In) => {
    const key = keyFn(input);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = await f(input);
    cache.set(key, result);
    return result;
  });
};
```

### Batching Pattern

```typescript
/**
 * Проблема: Много мелких запросов вместо одного большого
 * Решение: Группировать запросы
 */

class Batcher<In, Out> {
  private batch: Array<{ input: In; resolve: (out: Out) => void }> = [];
  private timer?: NodeJS.Timeout;

  constructor(
    private batchFlow: Flow<In[], Out[]>,
    private maxSize = 100,
    private maxWait = 10
  ) {}

  execute: Flow<In, Out> = flow((input: In) => {
    return new Promise((resolve) => {
      this.batch.push({ input, resolve });

      if (this.batch.length >= this.maxSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWait);
      }
    });
  });

  private async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const batch = this.batch;
    this.batch = [];

    const inputs = batch.map(b => b.input);
    const outputs = await this.batchFlow(inputs);

    batch.forEach((b, i) => b.resolve(outputs[i]));
  }
}
```

### Stream Processing Pattern

```typescript
/**
 * Проблема: Обработка больших объёмов данных
 * Решение: Потоковая обработка
 */

const streamProcess = flow(async function* (
  source: AsyncIterable<Data>
) {
  const buffer: Data[] = [];
  const bufferSize = 1000;

  for await (const item of source) {
    buffer.push(item);

    if (buffer.length >= bufferSize) {
      // Обрабатываем батч
      const results = await processBatch(buffer.splice(0));
      for (const result of results) {
        yield result;
      }
    }
  }

  // Обрабатываем остаток
  if (buffer.length > 0) {
    const results = await processBatch(buffer);
    for (const result of results) {
      yield result;
    }
  }
});
```

## C.6 Паттерны Тестирования

### Mock Pattern

```typescript
/**
 * Проблема: Нужно тестировать Flow без реальных зависимостей
 * Решение: Создать mock-версии
 */

const createMockContext = (overrides?: Partial<Context>): Context => {
  return context({
    db: {
      query: flow(async () => [{ id: 1, name: 'Test' }]),
      insert: flow(async () => ({ id: 1 })),
      update: flow(async () => ({ success: true })),
      delete: flow(async () => ({ success: true }))
    },
    logger: {
      info: flow(() => {}),
      error: flow(() => {})
    },
    ...overrides
  });
};

// Тестирование
const testFlow = flow((ctx: Context) => {
  // Использует mock зависимости
  return ctx.db.query('SELECT * FROM users');
});

const result = await testFlow(createMockContext());
```

### Spy Pattern

```typescript
/**
 * Проблема: Нужно отслеживать вызовы Flow
 * Решение: Обернуть в spy
 */

const spy = <In, Out>(f: Flow<In, Out>) => {
  const calls: Array<{ input: In; output?: Out; error?: Error }> = [];

  const spied = flow(async (input: In) => {
    const call: any = { input };

    try {
      call.output = await f(input);
      return call.output;
    } catch (error) {
      call.error = error;
      throw error;
    } finally {
      calls.push(call);
    }
  });

  return { flow: spied, calls };
};
```

### Property-based Testing Pattern

```typescript
/**
 * Проблема: Нужно тестировать инварианты
 * Решение: Генеративное тестирование
 */

const propertyTest = <In, Out>(
  f: Flow<In, Out>,
  generator: () => In,
  property: (input: In, output: Out) => boolean,
  iterations = 100
) => {
  return flow(async () => {
    for (let i = 0; i < iterations; i++) {
      const input = generator();
      const output = await f(input);

      if (!property(input, output)) {
        throw new Error(
          `Property violated for input: ${JSON.stringify(input)}`
        );
      }
    }

    return { passed: true, iterations };
  });
};

// Пример: тестирование идемпотентности
const testIdempotent = propertyTest(
  normalize,
  () => generateRandomData(),
  async (input, output) => {
    const doubleNormalized = await normalize(output);
    return deepEqual(output, doubleNormalized);
  }
);
```

## C.7 Паттерны Безопасности

### Validation Pattern

```typescript
/**
 * Проблема: Нужно валидировать входные данные
 * Решение: Validation Flow
 */

const validate = <T>(
  schema: Schema<T>
): Flow<unknown, T> =>
  flow((input: unknown) => {
    const result = schema.validate(input);

    if (!result.valid) {
      throw new ValidationError(result.errors);
    }

    return result.value as T;
  });

// Композиция с основным Flow
const safeEndpoint = validate(userSchema)
  .pipe(processUser)
  .pipe(formatResponse);
```

### Sanitization Pattern

```typescript
/**
 * Проблема: Нужно очистить данные от опасного содержимого
 * Решение: Sanitization Flow
 */

const sanitize = flow((input: any) => {
  if (typeof input === 'string') {
    // Удаляем опасные символы
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitize(item));
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitize(key)] = sanitize(value);
    }
    return sanitized;
  }

  return input;
});
```

### Rate Limiting Pattern

```typescript
/**
 * Проблема: Нужно ограничить частоту вызовов
 * Решение: Rate limiter
 */

class RateLimiter<In, Out> {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private flow: Flow<In, Out>,
    private maxTokens = 10,
    private refillRate = 1 // токенов в секунду
  ) {
    this.tokens = maxTokens;
  }

  execute: Flow<In, Out> = flow(async (input: In) => {
    // Пополняем токены
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + timePassed * this.refillRate
    );
    this.lastRefill = now;

    // Проверяем доступность токенов
    if (this.tokens < 1) {
      throw new RateLimitError('Rate limit exceeded');
    }

    this.tokens--;
    return await this.flow(input);
  });
}
```

---

Этот каталог паттернов предоставляет готовые решения для типичных задач при работе с Holon Flow. Каждый паттерн включает описание проблемы, решение и практический пример использования.