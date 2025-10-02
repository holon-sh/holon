# Приложение F: Экосистема Модулей

## F.1 Архитектура Модульной Системы

### Принципы Проектирования

1. **Композируемость** - Модули должны легко комбинироваться
2. **Изоляция** - Модули не должны конфликтовать друг с другом
3. **Ленивая загрузка** - Модули загружаются только при необходимости
4. **Type Safety** - Полная типизация всех расширений
5. **Tree Shaking** - Неиспользуемый код автоматически удаляется

### Структура Модуля

```typescript
// Стандартная структура модуля
export interface ModuleDefinition<T extends object> {
  // Метаданные
  name: string | symbol;
  version: string;
  description?: string;
  author?: string;
  license?: string;

  // Зависимости
  dependencies?: Array<string | symbol>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Array<string | symbol>;

  // Фабрика расширений
  factory: (ctx: Context) => T | Promise<T>;

  // Хуки жизненного цикла
  onInit?: (ctx: Context) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;

  // Конфигурация
  config?: {
    schema: JSONSchema;
    defaults: any;
  };
}
```

---

## F.2 Core Модули

### @holon/flow-core

Основные утилиты и функции.

```typescript
import { coreModule } from '@holon/flow';

const ctx = context().use(coreModule);

// Доступные функции
ctx.core.pipe(...flows);        // Композиция
ctx.core.parallel(...flows);     // Параллельное выполнение
ctx.core.race(...flows);         // Гонка
ctx.core.retry(flow, options);   // Повторы
ctx.core.timeout(flow, ms);      // Таймаут
ctx.core.throttle(flow, ms);     // Ограничение частоты
ctx.core.debounce(flow, ms);     // Отложенное выполнение
ctx.core.memoize(flow);          // Мемоизация
ctx.core.batch(flow, options);   // Батчинг
```

### @holon/flow-effects

Система эффектов и их анализ.

```typescript
import { effectsModule } from '@holon/effects';

const ctx = context().use(effectsModule);

// Создание Flow с эффектами
const pureFlow = ctx.effects.pure(
  (x: number) => x * 2
);

const ioFlow = ctx.effects.io(
  async (path: string) => fs.readFile(path)
);

// Анализ эффектов
const analysis = ctx.effects.analyze(complexFlow);
console.log(analysis);
// {
//   pure: false,
//   effects: Effect.Read | Effect.Async,
//   sideEffects: ['fs.readFile'],
//   async: true
// }

// Ограничение эффектов
const limited = ctx.effects.restrict(
  unsafeFlow,
  Effect.Read // Только чтение
);
```

### @holon/flow-context

Расширенное управление контекстом.

```typescript
import { contextModule } from '@holon/flow-context';

const ctx = context().use(contextModule);

// Scoped context
const scoped = ctx.context.scope('request', {
  id: generateId(),
  timestamp: Date.now()
});

// Context propagation
const child = ctx.context.fork();

// Context merging
const merged = ctx.context.merge(ctx1, ctx2);

// Context isolation
const isolated = ctx.context.isolate(['db', 'logger']);
```

---

## F.3 Data Модули

### @holon/flow-database

Универсальный доступ к базам данных.

```typescript
import { database } from '@holon/flow-database';

const ctx = context().use(database({
  driver: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 }
}));

// Query builder
const users = await ctx.db
  .select('*')
  .from('users')
  .where('active', true)
  .orderBy('created_at', 'desc')
  .limit(10);

// Transactions
const result = await ctx.db.transaction(async (tx) => {
  const user = await tx.insert('users', userData);
  await tx.insert('profiles', { userId: user.id, ...profileData });
  return user;
});

// Migrations
await ctx.db.migrate.latest();
await ctx.db.migrate.rollback();

// Schema builder
await ctx.db.schema.createTable('posts', (table) => {
  table.uuid('id').primary();
  table.string('title').notNullable();
  table.text('content');
  table.timestamps(true, true);
  table.index(['created_at']);
});
```

### @holon/flow-cache

Многоуровневое кэширование.

```typescript
import { cache } from '@holon/flow-cache';

const ctx = context().use(cache({
  layers: [
    { type: 'memory', max: 1000, ttl: 60 },
    { type: 'redis', connection: redisUrl, ttl: 3600 },
    { type: 'cdn', provider: 'cloudflare', ttl: 86400 }
  ]
}));

// Simple caching
const cached = ctx.cache.wrap(expensiveFlow, {
  key: (input) => `flow:${hash(input)}`,
  ttl: 300
});

// Manual cache operations
await ctx.cache.set('key', value, { ttl: 600 });
const value = await ctx.cache.get('key');
await ctx.cache.delete('key');
await ctx.cache.clear();

// Cache warming
await ctx.cache.warm(['popular:1', 'popular:2']);

// Cache invalidation
await ctx.cache.invalidate({ pattern: 'user:*' });
```

### @holon/flow-queue

Очереди и обработка задач.

```typescript
import { queue } from '@holon/flow-queue';

const ctx = context().use(queue({
  driver: 'redis',
  connection: redisUrl
}));

// Create queue
const emailQueue = ctx.queue.create('emails', {
  concurrency: 10,
  rateLimit: { max: 100, duration: 60000 }
});

// Add jobs
await emailQueue.add('send-welcome', {
  to: user.email,
  template: 'welcome'
}, {
  delay: 5000,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 }
});

// Process jobs
emailQueue.process('send-welcome', async (job) => {
  await sendEmail(job.data);
  return { success: true };
});

// Events
emailQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

emailQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});
```

---

## F.4 Network Модули

### @holon/flow-http

HTTP client и server.

```typescript
import { http } from '@holon/flow-http';

const ctx = context().use(http());

// HTTP Client
const response = await ctx.http.get('https://api.example.com/users');
const user = await ctx.http.post('https://api.example.com/users', {
  body: { name: 'Alice' },
  headers: { 'Authorization': 'Bearer token' }
});

// Request builder
const api = ctx.http.create({
  baseURL: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' },
  timeout: 5000
});

const users = await api.get('/users');

// HTTP Server
const server = ctx.http.server({
  port: 3000,

  routes: {
    'GET /': flow(() => ({ message: 'Hello' })),
    'POST /users': flow(async (req) => {
      const user = await createUser(req.body);
      return { status: 201, body: user };
    })
  },

  middleware: [
    cors(),
    bodyParser(),
    rateLimit({ max: 100 })
  ]
});

await server.start();
```

### @holon/flow-graphql

GraphQL server и client.

```typescript
import { graphql } from '@holon/flow-graphql';

const ctx = context().use(graphql());

// GraphQL Server
const server = ctx.graphql.server({
  schema: `
    type User {
      id: ID!
      name: String!
      posts: [Post!]!
    }

    type Query {
      user(id: ID!): User
      users: [User!]!
    }

    type Mutation {
      createUser(input: CreateUserInput!): User!
    }
  `,

  resolvers: {
    Query: {
      user: flow(async (parent, args) => {
        return await ctx.db.users.findById(args.id);
      }),
      users: flow(async () => {
        return await ctx.db.users.findAll();
      })
    },

    Mutation: {
      createUser: flow(async (parent, args) => {
        return await ctx.db.users.create(args.input);
      })
    },

    User: {
      posts: flow(async (user) => {
        return await ctx.db.posts.findByUserId(user.id);
      })
    }
  }
});

// GraphQL Client
const client = ctx.graphql.client({
  url: 'https://api.example.com/graphql'
});

const user = await client.query({
  query: `
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        posts {
          title
        }
      }
    }
  `,
  variables: { id: '123' }
});
```

### @holon/flow-websocket

WebSocket поддержка.

```typescript
import { websocket } from '@holon/flow-websocket';

const ctx = context().use(websocket());

// WebSocket Server
const ws = ctx.websocket.server({
  port: 8080,

  onConnection: flow(async (socket) => {
    console.log('Client connected');

    socket.on('message', flow(async (data) => {
      const result = await processMessage(data);
      socket.send(result);
    }));

    socket.on('close', flow(() => {
      console.log('Client disconnected');
    }));
  })
});

// WebSocket Client
const client = ctx.websocket.client('ws://localhost:8080');

client.on('open', flow(() => {
  client.send({ type: 'subscribe', channel: 'updates' });
}));

client.on('message', flow((data) => {
  console.log('Received:', data);
}));
```

---

## F.5 Infrastructure Модули

### @holon/flow-docker

Docker интеграция.

```typescript
import { docker } from '@holon/flow-docker';

const ctx = context().use(docker());

// Container management
const container = await ctx.docker.create({
  image: 'node:18',
  cmd: ['npm', 'start'],
  env: {
    NODE_ENV: 'production'
  },
  ports: {
    '3000/tcp': 3000
  },
  volumes: {
    '/app': process.cwd()
  }
});

await container.start();
await container.logs({ follow: true });
await container.stop();
await container.remove();

// Image building
await ctx.docker.build({
  dockerfile: './Dockerfile',
  tag: 'myapp:latest',
  context: process.cwd()
});

// Compose
await ctx.docker.compose({
  file: './docker-compose.yml',
  command: 'up',
  detach: true
});
```

### @holon/flow-kubernetes

Kubernetes оператор.

```typescript
import { kubernetes } from '@holon/flow-kubernetes';

const ctx = context().use(kubernetes({
  config: '~/.kube/config'
}));

// Deploy application
await ctx.k8s.apply({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: {
    name: 'myapp',
    namespace: 'production'
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'myapp' }
    },
    template: {
      metadata: {
        labels: { app: 'myapp' }
      },
      spec: {
        containers: [{
          name: 'app',
          image: 'myapp:latest',
          ports: [{ containerPort: 3000 }]
        }]
      }
    }
  }
});

// Watch resources
const watcher = ctx.k8s.watch('pods', {
  namespace: 'production',
  labelSelector: 'app=myapp'
});

watcher.on('ADDED', flow((pod) => {
  console.log('Pod added:', pod.metadata.name);
}));

// Execute in pod
const result = await ctx.k8s.exec('myapp-xyz', {
  container: 'app',
  command: ['node', '--version']
});
```

### @holon/flow-cloud

Multi-cloud абстракция.

```typescript
import { cloud } from '@holon/flow-cloud';

const ctx = context().use(cloud({
  providers: {
    aws: { region: 'us-east-1' },
    gcp: { project: 'my-project' },
    azure: { subscription: 'sub-123' }
  }
}));

// Storage (S3, GCS, Azure Blob)
await ctx.cloud.storage.upload('bucket', 'key', data);
const file = await ctx.cloud.storage.download('bucket', 'key');
await ctx.cloud.storage.delete('bucket', 'key');

// Compute (EC2, GCE, Azure VM)
const instance = await ctx.cloud.compute.create({
  provider: 'aws',
  type: 't3.medium',
  image: 'ami-12345',
  script: startupScript
});

// Serverless (Lambda, Cloud Functions, Azure Functions)
const fn = await ctx.cloud.function.deploy({
  provider: 'aws',
  runtime: 'nodejs18',
  handler: 'index.handler',
  code: './dist',
  environment: {
    NODE_ENV: 'production'
  }
});

await fn.invoke({ payload: data });
```

---

## F.6 Development Модули

### @holon/flow-testing

Тестирование Flow.

```typescript
import { testing } from '@holon/flow-testing';

const ctx = context().use(testing());

// Unit tests
ctx.test.describe('User Flow', () => {
  ctx.test.it('should create user', async () => {
    const mockDb = ctx.test.mock(database);
    mockDb.users.create.returns({ id: '123' });

    const result = await createUserFlow({ name: 'Alice' });

    ctx.test.expect(result).toEqual({ id: '123' });
    ctx.test.expect(mockDb.users.create).toHaveBeenCalledWith({
      name: 'Alice'
    });
  });
});

// Property-based testing
ctx.test.property('flow is idempotent',
  ctx.test.gen.string(),
  async (input) => {
    const result1 = await myFlow(input);
    const result2 = await myFlow(result1);
    return ctx.test.expect(result1).toEqual(result2);
  }
);

// Snapshot testing
ctx.test.it('should match snapshot', async () => {
  const result = await complexFlow(input);
  ctx.test.expect(result).toMatchSnapshot();
});

// Performance testing
ctx.test.benchmark('flow performance', async () => {
  await myFlow(testData);
}, {
  iterations: 1000,
  maxTime: 100 // ms
});
```

### @holon/flow-debug

Отладка и профилирование.

```typescript
import { debug } from '@holon/flow-debug';

const ctx = context().use(debug());

// Tracing
const traced = ctx.debug.trace(myFlow, {
  name: 'MyFlow',
  includeArgs: true,
  includeResult: true
});

// Breakpoints
const withBreakpoint = ctx.debug.breakpoint(myFlow, {
  condition: (input) => input.id === 'debug',
  onBreak: (input, context) => {
    console.log('Breakpoint hit:', { input, context });
    // Pause execution for debugging
  }
});

// Step debugging
const stepper = ctx.debug.step(complexFlow);
await stepper.next(); // Execute next step
await stepper.continue(); // Continue to end
await stepper.inspect(); // Inspect current state

// Performance profiling
const profiled = ctx.debug.profile(myFlow);
await profiled(input);
console.log(profiled.report());
// {
//   totalTime: 125,
//   selfTime: 45,
//   calls: [
//     { name: 'validation', time: 15 },
//     { name: 'processing', time: 65 }
//   ]
// }
```

### @holon/flow-docs

Автоматическая документация.

```typescript
import { docs } from '@holon/flow-docs';

const ctx = context().use(docs());

// Generate API documentation
const apiDocs = ctx.docs.generate({
  flows: [userFlow, orderFlow, productFlow],
  format: 'openapi',
  output: './docs/api.yaml'
});

// Generate TypeScript definitions
const types = ctx.docs.generateTypes({
  flows: allFlows,
  output: './types/flows.d.ts'
});

// Generate markdown documentation
const markdown = ctx.docs.generateMarkdown({
  flows: allFlows,
  includeExamples: true,
  output: './docs/flows.md'
});

// Interactive documentation
const server = ctx.docs.serve({
  port: 4000,
  flows: allFlows,
  playground: true
});
```

---

## F.7 AI/ML Модули

### @holon/flow-ai

AI интеграция.

```typescript
import { ai } from '@holon/flow-ai';

const ctx = context().use(ai({
  provider: 'openai',
  apiKey: process.env.OPENAI_KEY
}));

// Text generation
const generated = await ctx.ai.generate({
  prompt: 'Write a function that...',
  model: 'gpt-4',
  temperature: 0.7
});

// Embeddings
const embedding = await ctx.ai.embed({
  text: 'Hello world',
  model: 'text-embedding-3-large'
});

// Vision
const description = await ctx.ai.vision({
  image: imageBuffer,
  prompt: 'What is in this image?'
});

// Function calling
const result = await ctx.ai.function({
  prompt: 'Get the weather in Paris',
  functions: [{
    name: 'getWeather',
    parameters: {
      location: 'string',
      units: 'celsius' | 'fahrenheit'
    }
  }]
});
```

### @holon/flow-ml

Machine Learning pipelines.

```typescript
import { ml } from '@holon/flow-ml';

const ctx = context().use(ml());

// Data preprocessing
const preprocessed = ctx.ml.preprocess(data, {
  normalize: true,
  handleMissing: 'mean',
  encoding: 'one-hot'
});

// Model training
const model = await ctx.ml.train({
  algorithm: 'random-forest',
  data: preprocessed,
  features: ['age', 'income', 'score'],
  target: 'churn',
  validation: 0.2
});

// Prediction
const predictions = await model.predict(newData);

// Model evaluation
const metrics = await ctx.ml.evaluate(model, testData);
console.log(metrics);
// {
//   accuracy: 0.92,
//   precision: 0.89,
//   recall: 0.91,
//   f1: 0.90
// }

// AutoML
const bestModel = await ctx.ml.auto({
  data: trainingData,
  target: 'price',
  metric: 'rmse',
  timeLimit: 3600 // seconds
});
```

---

## F.8 Community Модули

### Популярные Community Модули

| Модуль | Описание | Установок/мес |
|--------|----------|---------------|
| `@community/flow-auth` | Аутентификация и авторизация | 125K |
| `@community/flow-stripe` | Stripe интеграция | 89K |
| `@community/flow-email` | Email отправка | 76K |
| `@community/flow-storage` | File storage | 65K |
| `@community/flow-scheduler` | Cron jobs | 54K |
| `@community/flow-pdf` | PDF генерация | 43K |
| `@community/flow-image` | Image processing | 38K |
| `@community/flow-crypto` | Cryptography | 32K |
| `@community/flow-blockchain` | Web3 интеграция | 28K |
| `@community/flow-iot` | IoT devices | 21K |

### Создание Community Модуля

```typescript
// package.json
{
  "name": "@yourname/flow-custom",
  "version": "1.0.0",
  "description": "Custom module for Holon Flow",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["holon", "flow", "module"],
  "peerDependencies": {
    "@holon/flow": "^10.0.0"
  }
}

// src/index.ts
import { module, flow } from '@holon/flow';

export const customModule = module(
  Symbol.for('custom'),
  (ctx) => ({
    custom: {
      doSomething: flow(async (input: string) => {
        // Your implementation
        return `Processed: ${input}`;
      }),

      doSomethingElse: flow((data: any) => {
        // Another feature
        return transform(data);
      })
    }
  }),
  {
    version: '1.0.0',
    dependencies: ['database', 'cache']
  }
);

// Экспорт типов
declare module '@holon/flow' {
  interface Context {
    custom?: {
      doSomething: Flow<string, string>;
      doSomethingElse: Flow<any, any>;
    };
  }
}
```

---

## F.9 Управление Модулями

### Установка и Обновление

```bash
# Установка модуля
npm install @holon/flow-database

# Установка с зависимостями
npm install @holon/flow-graphql @holon/flow-database

# Обновление до последней версии
npm update @holon/flow-cache

# Проверка устаревших модулей
npm outdated | grep @holon
```

### Конфигурация Модулей

```typescript
// holon.config.ts
export default {
  modules: {
    // Автозагрузка модулей
    autoload: [
      '@holon/flow-core',
      '@holon/flow-effects',
      '@holon/flow-context'
    ],

    // Конфигурация модулей
    configs: {
      '@holon/flow-database': {
        connection: process.env.DATABASE_URL,
        pool: { min: 2, max: 10 }
      },

      '@holon/flow-cache': {
        driver: 'redis',
        ttl: 3600
      }
    },

    // Алиасы для модулей
    aliases: {
      'db': '@holon/flow-database',
      'api': '@custom/flow-api'
    }
  }
};
```

### Registry и Discovery

```typescript
import { registry } from '@holon/flow-registry';

// Поиск модулей
const modules = await registry.search({
  query: 'authentication',
  tags: ['security', 'jwt'],
  minDownloads: 1000
});

// Информация о модуле
const info = await registry.info('@community/flow-auth');
console.log(info);
// {
//   name: '@community/flow-auth',
//   version: '2.5.1',
//   description: 'Authentication module',
//   downloads: 125000,
//   rating: 4.8,
//   dependencies: ['@holon/flow-core']
// }

// Установка из registry
await registry.install('@community/flow-auth');
```

---

## F.10 Best Practices

### 1. Модульная Архитектура

```typescript
// Разделяйте concerns
const dataModule = module('data', (ctx) => ({
  repository: userRepository,
  cache: userCache
}));

const businessModule = module('business', (ctx) => ({
  userService: createUserService(ctx),
  orderService: createOrderService(ctx)
}), {
  dependencies: ['data']
});

const apiModule = module('api', (ctx) => ({
  routes: createRoutes(ctx)
}), {
  dependencies: ['business']
});
```

### 2. Версионирование

```typescript
// Semantic versioning
const myModule = module('my-module', factory, {
  version: '1.2.3', // major.minor.patch

  // Совместимость
  compatible: (version) => {
    const [major] = version.split('.');
    return major === '1'; // Совместим с 1.x.x
  }
});
```

### 3. Тестирование Модулей

```typescript
import { testModule } from '@holon/flow-testing';

describe('MyModule', () => {
  it('should initialize correctly', async () => {
    const ctx = context();
    const result = await testModule(myModule, ctx);

    expect(result).toHaveProperty('myFeature');
    expect(result.myFeature).toBeInstanceOf(Flow);
  });

  it('should handle dependencies', async () => {
    const ctx = context().use(dependencyModule);
    const result = await testModule(myModule, ctx);

    expect(result).toBeDefined();
  });
});
```

### 4. Документирование

```typescript
/**
 * @module @yourname/flow-custom
 * @description Custom module for specific functionality
 * @requires @holon/flow-database
 * @requires @holon/flow-cache
 */

/**
 * Creates a custom processor
 * @param {ProcessorOptions} options - Configuration options
 * @returns {Flow<Input, Output>} Processing flow
 * @example
 * ```typescript
 * const processor = createProcessor({ mode: 'fast' });
 * const result = await processor(data);
 * ```
 */
export function createProcessor(options: ProcessorOptions) {
  // ...
}
```

---

Экосистема модулей Holon Flow предоставляет богатый набор готовых решений и простые инструменты для создания собственных модулей, обеспечивая максимальную гибкость и переиспользование кода.