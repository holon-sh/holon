# Приложение D: Руководство по Миграции

## D.1 Стратегии Миграции

### Постепенная Миграция (Рекомендуется)

Holon Flow спроектирован для постепенной интеграции в существующие проекты. Вы можете начать с одной функции и расширять использование по мере необходимости.

```typescript
// Шаг 1: Обёртка существующих функций
import { flow } from '@holon/flow';
import { existingFunction } from './legacy';

const wrappedFlow = flow(existingFunction);

// Шаг 2: Постепенная композиция
const enhanced = wrappedFlow
  .pipe(validation)
  .pipe(transformation);

// Шаг 3: Замена по частям
export const newAPI = enhanced; // Новый API
export const oldAPI = existingFunction; // Сохраняем старый для совместимости
```

### Параллельная Миграция

Запуск новой системы параллельно со старой для валидации.

```typescript
const parallel = flow(async (input: any) => {
  const [oldResult, newResult] = await Promise.all([
    oldSystem.process(input),
    newSystem.process(input)
  ]);

  // Сравнение результатов
  if (!deepEqual(oldResult, newResult)) {
    logger.warn('Results differ', { oldResult, newResult });
  }

  // Возвращаем результат старой системы пока не уверены
  return oldResult;
});
```

### Big Bang Миграция

Полная замена за один раз (для небольших проектов).

---

## D.2 Миграция с Express.js

### Было (Express)
```javascript
// routes/users.js
const express = require('express');
const router = express.Router();

router.get('/:id', async (req, res, next) => {
  try {
    const user = await db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/',
  validateBody(userSchema),
  authenticate,
  async (req, res, next) => {
    try {
      const user = await db.users.create(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
```

### Стало (Holon Flow)
```typescript
import { flow, context } from '@holon/flow';

// Определяем Flow для каждого endpoint
const getUser = flow(async (ctx: Context, params: {id: string}) => {
  const user = await ctx.db.users.findById(params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
});

const createUser = flow(async (ctx: Context, body: UserData) => {
  const user = await ctx.db.users.create(body);
  return { status: 201, data: user };
});

// Композиция с middleware
const authenticatedCreateUser = authenticate
  .pipe(validate(userSchema))
  .pipe(createUser);

// Адаптер для Express
const expressAdapter = (f: Flow<any, any>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = context({
        db: database,
        user: req.user
      });

      const input = {
        params: req.params,
        body: req.body,
        query: req.query
      };

      const result = await ctx.run(f, input);

      const status = result.status || 200;
      res.status(status).json(result.data || result);
    } catch (error) {
      next(error);
    }
  };
};

// Использование в Express
app.get('/users/:id', expressAdapter(getUser));
app.post('/users', expressAdapter(authenticatedCreateUser));
```

### Миграционный Мост

```typescript
// Функция для постепенной миграции Express middleware
const migrateMiddleware = (middleware: RequestHandler): Flow<Request, Request> => {
  return flow((req: Request) => {
    return new Promise((resolve, reject) => {
      middleware(req as any, {} as any, (err?: any) => {
        if (err) reject(err);
        else resolve(req);
      });
    });
  });
};

// Использование
const oldAuth = migrateMiddleware(passportAuthenticate);
const pipeline = oldAuth.pipe(newBusinessLogic);
```

---

## D.3 Миграция с RxJS

### Было (RxJS)
```typescript
import {
  Observable,
  from,
  interval,
  merge,
  combineLatest
} from 'rxjs';
import {
  map,
  filter,
  debounceTime,
  retry,
  catchError,
  switchMap
} from 'rxjs/operators';

// Observable pipeline
const user$ = userId$.pipe(
  debounceTime(300),
  switchMap(id => from(fetchUser(id))),
  retry(3),
  map(user => ({
    ...user,
    displayName: user.name.toUpperCase()
  })),
  catchError(err => of(null))
);

// Комбинирование потоков
const combined$ = combineLatest([
  user$,
  settings$,
  permissions$
]).pipe(
  map(([user, settings, permissions]) => ({
    user,
    settings,
    permissions
  }))
);
```

### Стало (Holon Flow)
```typescript
import { flow, debounce, retry } from '@holon/flow';

// Flow pipeline
const fetchUserFlow = flow(async (id: string) => {
  const user = await fetchUser(id);
  return {
    ...user,
    displayName: user.name.toUpperCase()
  };
});

// С обработкой ошибок и retry
const resilientFetch = retry(fetchUserFlow, { attempts: 3 });
const debouncedFetch = debounce(resilientFetch, 300);

// Комбинирование Flow
const combined = flow(async (userId: string) => {
  const [user, settings, permissions] = await Promise.all([
    debouncedFetch(userId),
    fetchSettings(userId),
    fetchPermissions(userId)
  ]);

  return { user, settings, permissions };
});
```

### Адаптер RxJS → Flow

```typescript
import { Observable } from 'rxjs';

// Конвертация Observable в Flow
const fromObservable = <T>(
  observable$: Observable<T>
): Flow<void, T> => {
  return flow(() => {
    return new Promise((resolve, reject) => {
      const subscription = observable$.subscribe({
        next: resolve,
        error: reject,
        complete: () => resolve(undefined as any)
      });

      // Cleanup при отмене
      if (typeof AbortController !== 'undefined') {
        const controller = new AbortController();
        controller.signal.addEventListener('abort', () => {
          subscription.unsubscribe();
        });
      }
    });
  });
};

// Конвертация Flow в Observable
const toObservable = <In, Out>(
  flow: Flow<In, Out>
): ((input: In) => Observable<Out>) => {
  return (input: In) => {
    return new Observable(subscriber => {
      flow(input).then(
        result => {
          subscriber.next(result);
          subscriber.complete();
        },
        error => subscriber.error(error)
      );
    });
  };
};
```

### Паттерны Замены

| RxJS Оператор | Holon Flow Эквивалент |
|---------------|----------------------|
| `map` | `.pipe(flow(x => ...))` |
| `filter` | `.pipe(flow(x => x ? x : throw))` |
| `switchMap` | `.pipe(flow(async x => ...))` |
| `debounceTime` | `debounce(flow, ms)` |
| `retry` | `retry(flow, options)` |
| `timeout` | `timeout(flow, ms)` |
| `catchError` | `try/catch` или Result type |
| `tap` | `.pipe(flow(x => { sideEffect(x); return x; }))` |
| `take` | Используйте обычный счётчик |
| `combineLatest` | `Promise.all` |
| `merge` | `race` или `Promise.race` |

---

## D.4 Миграция с Redux/Redux-Saga

### Было (Redux + Saga)
```typescript
// Redux action
const FETCH_USER_REQUEST = 'FETCH_USER_REQUEST';
const FETCH_USER_SUCCESS = 'FETCH_USER_SUCCESS';
const FETCH_USER_FAILURE = 'FETCH_USER_FAILURE';

// Redux reducer
function userReducer(state = initialState, action: any) {
  switch (action.type) {
    case FETCH_USER_REQUEST:
      return { ...state, loading: true, error: null };
    case FETCH_USER_SUCCESS:
      return { ...state, loading: false, user: action.payload };
    case FETCH_USER_FAILURE:
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

// Redux-Saga
function* fetchUserSaga(action: any) {
  try {
    const user = yield call(api.fetchUser, action.payload);
    yield put({ type: FETCH_USER_SUCCESS, payload: user });
  } catch (error) {
    yield put({ type: FETCH_USER_FAILURE, error });
  }
}

function* watchFetchUser() {
  yield takeEvery(FETCH_USER_REQUEST, fetchUserSaga);
}
```

### Стало (Holon Flow)
```typescript
// State как иммутабельный контекст
interface AppState {
  user?: User;
  loading: boolean;
  error?: Error;
}

// Action как Flow
const fetchUser = flow(async (ctx: Context & AppState, userId: string) => {
  // Loading state
  const loadingCtx = ctx.with({ loading: true, error: undefined });

  try {
    const user = await api.fetchUser(userId);
    // Success state
    return loadingCtx.with({ loading: false, user });
  } catch (error) {
    // Error state
    return loadingCtx.with({ loading: false, error });
  }
});

// Saga паттерн через композицию
const userSaga = flow(async (ctx: Context) => {
  // Вместо takeEvery используем stream processing
  const events = ctx.eventStream;

  for await (const event of events) {
    if (event.type === 'FETCH_USER_REQUEST') {
      const newCtx = await fetchUser(ctx, event.userId);
      ctx = newCtx; // Обновляем контекст

      // Side effects
      if (newCtx.user) {
        await ctx.run(notifyUserLoaded, newCtx.user);
      }
    }
  }
});

// Простое управление состоянием без Redux
class StateManager {
  private state: AppState;
  private listeners: Set<(state: AppState) => void> = new Set();

  async dispatch(action: Flow<AppState, AppState>, ...args: any[]) {
    const ctx = context(this.state);
    this.state = await ctx.run(action, ...args);
    this.listeners.forEach(listener => listener(this.state));
  }

  subscribe(listener: (state: AppState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

---

## D.5 Миграция с Effect-TS

### Было (Effect-TS)
```typescript
import * as Effect from '@effect/io/Effect';
import * as Either from '@effect/data/Either';
import { pipe } from '@effect/data/Function';

// Effect-TS pipeline
const program = pipe(
  Effect.succeed(42),
  Effect.map(n => n * 2),
  Effect.flatMap(n =>
    n > 80
      ? Effect.succeed(n)
      : Effect.fail(new Error('Too small'))
  ),
  Effect.catchAll(error => Effect.succeed(0)),
  Effect.provide(Context)
);

// Запуск
const result = await Effect.runPromise(program);
```

### Стало (Holon Flow)
```typescript
import { flow, effectful, Effect } from '@holon/flow';

// Holon Flow pipeline
const program = flow((n: number) => n)
  .pipe(flow(n => n * 2))
  .pipe(flow(n => {
    if (n <= 80) throw new Error('Too small');
    return n;
  }));

// С обработкой ошибок
const safe = flow(async (input: number) => {
  try {
    return await program(input);
  } catch {
    return 0;
  }
});

// С эффектами
const withEffects = effectful(
  program,
  Effect.None // Явные эффекты
);

// Запуск
const result = await safe(42);
```

### Маппинг Концепций

| Effect-TS | Holon Flow |
|-----------|------------|
| `Effect<R, E, A>` | `Flow<Context & R, A>` с `Result<A, E>` |
| `pipe` | `.pipe()` метод |
| `Effect.succeed` | `flow(() => value)` |
| `Effect.fail` | `flow(() => { throw error })` |
| `Effect.map` | `.pipe(flow(x => ...))` |
| `Effect.flatMap` | `.pipe(flow(async x => ...))` |
| `Effect.catchAll` | `try/catch` |
| `Effect.provide` | `context.run(flow, input)` |
| `Layer` | `Module` |
| `Service` | Context extension |

---

## D.6 Миграция с Node.js Streams

### Было (Node Streams)
```javascript
const { Transform, pipeline } = require('stream');
const fs = require('fs');

// Transform stream
const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    this.push(chunk.toString().toUpperCase());
    callback();
  }
});

// Pipeline
pipeline(
  fs.createReadStream('input.txt'),
  upperCase,
  gzipStream,
  fs.createWriteStream('output.txt.gz'),
  (err) => {
    if (err) console.error('Pipeline failed:', err);
    else console.log('Pipeline succeeded');
  }
);
```

### Стало (Holon Flow)
```typescript
import { flow } from '@holon/flow';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';

// Transform как Flow
const upperCase = flow((chunk: Buffer) =>
  Buffer.from(chunk.toString().toUpperCase())
);

// Stream processing
const processStream = flow(async function* (source: AsyncIterable<Buffer>) {
  for await (const chunk of source) {
    const upper = await upperCase(chunk);
    const compressed = await gzip(upper);
    yield compressed;
  }
});

// Использование
const source = createReadStream('input.txt');
const destination = createWriteStream('output.txt.gz');

for await (const chunk of processStream(source)) {
  destination.write(chunk);
}
```

### Stream Adapter

```typescript
// Адаптер для Node.js streams
import { Transform } from 'stream';

const flowToTransform = <In, Out>(
  f: Flow<In, Out>
): Transform => {
  return new Transform({
    async transform(chunk: In, encoding, callback) {
      try {
        const result = await f(chunk);
        callback(null, result);
      } catch (error) {
        callback(error as Error);
      }
    }
  });
};

// Использование с существующими streams
pipeline(
  readStream,
  flowToTransform(processFlow),
  writeStream,
  callback
);
```

---

## D.7 Миграция с AWS Lambda

### Было (AWS Lambda)
```javascript
exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event));

  try {
    // Парсинг входных данных
    const body = JSON.parse(event.body);

    // Валидация
    if (!body.userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'userId required' })
      };
    }

    // Бизнес-логика
    const user = await fetchUser(body.userId);
    const processed = await processUser(user);

    // Формирование ответа
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(processed)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

### Стало (Holon Flow)
```typescript
import { flow, context } from '@holon/flow';

// Бизнес-логика как Flow
const processUserFlow = flow(async (ctx: Context, userId: string) => {
  const user = await ctx.db.fetchUser(userId);
  return await ctx.run(processUser, user);
});

// Валидация как Flow
const validateInput = flow((body: any) => {
  if (!body.userId) {
    throw new ValidationError('userId required');
  }
  return body;
});

// Lambda handler через композицию
const lambdaFlow = validateInput
  .pipe(flow(body => body.userId))
  .pipe(processUserFlow)
  .pipe(flow(result => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result)
  })));

// Адаптер для AWS Lambda
export const handler = async (event: any, lambdaContext: any) => {
  const ctx = context({
    db: database,
    aws: {
      requestId: lambdaContext.requestId,
      functionName: lambdaContext.functionName
    }
  });

  try {
    const body = JSON.parse(event.body);
    return await ctx.run(lambdaFlow, body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: error.message })
      };
    }

    ctx.log.error('Lambda error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

---

## D.8 Миграция с Fastify/Koa

### Было (Fastify)
```typescript
fastify.get('/users/:id', {
  preValidation: [authenticate],
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' }
      }
    },
    response: {
      200: userSchema
    }
  }
}, async (request, reply) => {
  const user = await db.users.findById(request.params.id);
  if (!user) {
    return reply.code(404).send({ error: 'Not found' });
  }
  return user;
});
```

### Стало (Holon Flow)
```typescript
// Schema validation как Flow
const validateParams = flow((params: any) => {
  if (!isUUID(params.id)) {
    throw new ValidationError('Invalid UUID');
  }
  return params;
});

// Endpoint как композиция Flow
const getUserEndpoint = authenticate
  .pipe(validateParams)
  .pipe(flow(async (ctx: Context, params) => {
    const user = await ctx.db.users.findById(params.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }));

// Fastify adapter
const fastifyAdapter = (f: Flow<any, any>) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = context({ db: database });

    try {
      const result = await ctx.run(f, request.params);
      return reply.send(result);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      throw error;
    }
  };
};

fastify.get('/users/:id', fastifyAdapter(getUserEndpoint));
```

---

## D.9 Инструменты Миграции

### Автоматический Конвертер

```typescript
// CLI инструмент для автоматической конвертации
import { flow } from '@holon/flow';

const convertExpressRoute = (routeCode: string): string => {
  // Парсинг Express route
  const ast = parseCode(routeCode);

  // Трансформация в Flow
  const flowAst = transformToFlow(ast);

  // Генерация кода
  return generateCode(flowAst);
};

// Использование
// npx holon-migrate express ./routes --output ./flows
```

### Анализатор Совместимости

```typescript
const analyzeCodebase = flow(async (projectPath: string) => {
  const files = await scanFiles(projectPath);

  const report = {
    totalFiles: files.length,
    compatible: 0,
    needsAdapter: 0,
    needsRewrite: 0,
    patterns: new Map<string, number>()
  };

  for (const file of files) {
    const analysis = await analyzeFile(file);
    report[analysis.compatibility]++;

    for (const pattern of analysis.patterns) {
      const count = report.patterns.get(pattern) || 0;
      report.patterns.set(pattern, count + 1);
    }
  }

  return report;
});
```

### Валидатор Миграции

```typescript
// Проверка корректности миграции
const validateMigration = flow(async (
  oldImpl: Function,
  newImpl: Flow<any, any>,
  testCases: TestCase[]
) => {
  const results = [];

  for (const testCase of testCases) {
    const oldResult = await oldImpl(testCase.input);
    const newResult = await newImpl(testCase.input);

    results.push({
      testCase: testCase.name,
      passed: deepEqual(oldResult, newResult),
      oldResult,
      newResult
    });
  }

  return {
    totalTests: testCases.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed),
    successRate: results.filter(r => r.passed).length / testCases.length
  };
});
```

---

## D.10 Лучшие Практики Миграции

### 1. Начните с Листьев Дерева Зависимостей

```typescript
// Мигрируйте сначала утилиты и pure functions
const utils = {
  formatDate: flow((date: Date) => date.toISOString()),
  parseJSON: flow((text: string) => JSON.parse(text)),
  calculateHash: flow((data: string) => hash(data))
};

// Затем бизнес-логику
const business = {
  processOrder: flow(async (order) => {
    const formatted = utils.formatDate(order.date);
    // ...
  })
};
```

### 2. Используйте Фасады для Постепенной Миграции

```typescript
// Фасад, скрывающий новую реализацию за старым API
export class UserService {
  // Старый метод для совместимости
  async getUser(id: string): Promise<User> {
    const ctx = context({ db: this.db });
    return ctx.run(getUserFlow, id);
  }

  // Новый метод на Flow
  getUserFlow = flow(async (ctx: Context, id: string) => {
    return await ctx.db.users.findById(id);
  });
}
```

### 3. Тестируйте Параллельно

```typescript
const parallelTest = flow(async (input: any) => {
  const [oldResult, newResult] = await Promise.all([
    oldImplementation(input),
    newImplementation(input)
  ]);

  // Логирование расхождений
  if (!deepEqual(oldResult, newResult)) {
    await logDifference(input, oldResult, newResult);
  }

  // Feature flag для переключения
  return useNewImplementation ? newResult : oldResult;
});
```

### 4. Мигрируйте по Вертикальным Слайсам

```typescript
// Мигрируйте полную фичу от API до БД
const featureSlice = {
  api: getUserEndpoint,        // API layer
  service: getUserService,     // Service layer
  repository: getUserRepo,     // Data layer
  tests: getUserTests          // Tests
};

// Вместо горизонтальной миграции по слоям
```

---

## D.11 Частые Проблемы и Решения

### Проблема: Mutable State

```typescript
// Старый код с мутациями
let counter = 0;
function increment() {
  counter++;
  return counter;
}

// Решение: Иммутабельный контекст
const increment = flow((ctx: Context & {counter: number}) => {
  return ctx.with({ counter: ctx.counter + 1 });
});
```

### Проблема: Глобальные Зависимости

```typescript
// Старый код с глобалами
import { db } from './database';
async function getUser(id: string) {
  return await db.users.findById(id);
}

// Решение: Dependency Injection через контекст
const getUser = flow(async (ctx: Context, id: string) => {
  return await ctx.db.users.findById(id);
});
```

### Проблема: Callback Hell

```typescript
// Старый код с callbacks
function processFile(path, callback) {
  fs.readFile(path, (err, data) => {
    if (err) return callback(err);
    process(data, (err, result) => {
      if (err) return callback(err);
      save(result, callback);
    });
  });
}

// Решение: Линейная композиция
const processFile = flow((path: string) => fs.promises.readFile(path))
  .pipe(process)
  .pipe(save);
```

### Проблема: Сложное Тестирование

```typescript
// Старый код с моками
jest.mock('./database');
test('getUser', async () => {
  mockDb.users.findById.mockResolvedValue(testUser);
  const result = await getUser('123');
  expect(result).toEqual(testUser);
});

// Решение: Чистое тестирование через контекст
test('getUser', async () => {
  const ctx = context({
    db: {
      users: {
        findById: flow(async () => testUser)
      }
    }
  });

  const result = await ctx.run(getUser, '123');
  expect(result).toEqual(testUser);
});
```

---

Это руководство обеспечивает плавную миграцию с любой существующей системы на Holon Flow, сохраняя работоспособность кода на каждом этапе.