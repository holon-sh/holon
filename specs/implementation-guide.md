# Практическое Руководство по Реализации Holon Flow

## 1. Быстрый Старт

### 1.1 Установка

```bash
# Создание нового проекта
npx create-holon-app my-app
cd my-app

# Или добавление в существующий проект
npm install @holon/flow

# Установка дополнительных модулей
npm install @holon/flow-effects @holon/flow-database @holon/flow-http
```

### 1.2 Первый Flow

```typescript
// hello.ts
import { flow, context } from '@holon/flow';

// Простейший Flow
const greet = flow((name: string) => `Hello, ${name}!`);

// Композиция
const shout = greet
  .pipe(flow(s => s.toUpperCase()))
  .pipe(flow(s => `${s} 🎉`));

// Выполнение
async function main() {
  const ctx = context();
  const result = await ctx.run(shout, 'World');
  console.log(result); // "HELLO, WORLD! 🎉"
}

main();
```

### 1.3 Конфигурация TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

---

## 2. Архитектура Приложения

### 2.1 Структура Проекта

```
my-app/
├── src/
│   ├── flows/           # Бизнес-логика
│   │   ├── users/
│   │   │   ├── create.flow.ts
│   │   │   ├── update.flow.ts
│   │   │   └── delete.flow.ts
│   │   ├── orders/
│   │   └── products/
│   │
│   ├── modules/         # Кастомные модули
│   │   ├── database.module.ts
│   │   ├── cache.module.ts
│   │   └── auth.module.ts
│   │
│   ├── api/            # HTTP endpoints
│   │   ├── routes.ts
│   │   └── server.ts
│   │
│   ├── lib/            # Утилиты
│   │   ├── validators.ts
│   │   └── transformers.ts
│   │
│   ├── types/          # TypeScript типы
│   │   └── index.d.ts
│   │
│   └── index.ts        # Entry point
│
├── tests/              # Тесты
├── config/             # Конфигурация
├── .env                # Environment variables
└── package.json
```

### 2.2 Слоистая Архитектура

```typescript
// src/flows/users/create.flow.ts

// Domain Layer - чистая бизнес-логика
const validateUserData = flow((data: UserInput): ValidatedUser => {
  if (!data.email || !isEmail(data.email)) {
    throw new ValidationError('Invalid email');
  }
  if (!data.name || data.name.length < 2) {
    throw new ValidationError('Name too short');
  }
  return data as ValidatedUser;
});

const hashPassword = flow(async (user: ValidatedUser) => ({
  ...user,
  password: await bcrypt.hash(user.password, 10)
}));

// Application Layer - оркестрация
const createUser = flow(async (ctx: AppContext, input: UserInput) => {
  // Валидация
  const validated = await validateUserData(input);

  // Проверка уникальности
  const existing = await ctx.db.users.findByEmail(validated.email);
  if (existing) {
    throw new ConflictError('Email already exists');
  }

  // Хеширование пароля
  const withPassword = await hashPassword(validated);

  // Сохранение в БД
  const user = await ctx.db.users.create(withPassword);

  // Отправка события
  await ctx.events.emit('user.created', user);

  // Отправка email
  await ctx.queue.add('send-welcome-email', { userId: user.id });

  return user;
});

// Infrastructure Layer - HTTP endpoint
export const createUserEndpoint = flow(async (ctx: HttpContext, req: Request) => {
  try {
    const user = await createUser(ctx, req.body);
    return {
      status: 201,
      body: { success: true, user }
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { status: 400, body: { error: error.message } };
    }
    if (error instanceof ConflictError) {
      return { status: 409, body: { error: error.message } };
    }
    throw error;
  }
});
```

---

## 3. Реализация Core

### 3.1 Базовая Реализация Flow

```typescript
// src/core/flow.ts

export interface Flow<In, Out> {
  (input: In): Out | Promise<Out>;
  pipe<Next>(next: Flow<Out, Next>): Flow<In, Next>;
  meta?: FlowMeta;
}

export interface FlowMeta {
  name?: string;
  description?: string;
  created?: number;
  effects?: number;
}

export function flow<In, Out>(
  fn: (input: In) => Out | Promise<Out>,
  meta?: FlowMeta
): Flow<In, Out> {
  // Создаём функцию Flow
  const flowFn = Object.assign(
    async (input: In): Promise<Out> => {
      const start = performance.now();

      try {
        const result = await Promise.resolve(fn(input));

        // Метрики
        if (globalConfig.enableMetrics) {
          metrics.record({
            flow: meta?.name || fn.name || 'anonymous',
            duration: performance.now() - start,
            success: true
          });
        }

        return result;
      } catch (error) {
        // Метрики ошибок
        if (globalConfig.enableMetrics) {
          metrics.record({
            flow: meta?.name || fn.name || 'anonymous',
            duration: performance.now() - start,
            success: false,
            error: error.message
          });
        }

        throw error;
      }
    },
    {
      // Метод композиции
      pipe<Next>(next: Flow<Out, Next>): Flow<In, Next> {
        return flow(
          async (input: In) => {
            const intermediate = await flowFn(input);
            return await next(intermediate);
          },
          {
            name: `${meta?.name || 'flow'} → ${next.meta?.name || 'flow'}`,
            effects: (meta?.effects || 0) | (next.meta?.effects || 0)
          }
        );
      },

      // Метаданные
      meta: {
        ...meta,
        created: Date.now()
      }
    }
  );

  return flowFn as Flow<In, Out>;
}
```

### 3.2 Иммутабельный Контекст со Структурным Разделением

```typescript
// src/core/context.ts

export interface Context {
  readonly data: Map<string | symbol, any>;
  with<T extends object>(extensions: T): Context & T;
  get<T>(key: string | symbol): T | undefined;
  run<In, Out>(flow: Flow<In, Out>, input: In): Promise<Out>;
}

class ImmutableContext implements Context {
  readonly data: Map<string | symbol, any>;

  constructor(initial?: Map<string | symbol, any> | object) {
    if (initial instanceof Map) {
      this.data = initial;
    } else {
      this.data = new Map(Object.entries(initial || {}));
    }

    // Создаём прокси для удобного доступа
    return new Proxy(this, {
      get(target, prop) {
        // Сначала проверяем методы контекста
        if (prop in target) {
          return target[prop as keyof ImmutableContext];
        }
        // Затем данные
        return target.data.get(prop as string | symbol);
      }
    }) as ImmutableContext;
  }

  with<T extends object>(extensions: T): Context & T {
    // Структурное разделение - создаём новую Map, переиспользуя старые значения
    const newData = new Map(this.data);

    for (const [key, value] of Object.entries(extensions)) {
      newData.set(key, value);
    }

    return new ImmutableContext(newData) as Context & T;
  }

  get<T>(key: string | symbol): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  async run<In, Out>(flow: Flow<In, Out>, input: In): Promise<Out> {
    // Если Flow понимает контекст, передаём его
    if (isContextAware(flow)) {
      return await flow.withContext(this)(input);
    }

    // Иначе просто выполняем
    return await flow(input);
  }
}

export function context(initial?: object): Context {
  return new ImmutableContext(initial);
}

// Проверка, понимает ли Flow контекст
function isContextAware(flow: any): flow is ContextAwareFlow<any, any> {
  return typeof flow.withContext === 'function';
}
```

### 3.3 Система Эффектов

```typescript
// src/core/effects.ts

export const enum Effect {
  None     = 0,
  Read     = 1 << 0,  // 1
  Write    = 1 << 1,  // 2
  Async    = 1 << 2,  // 4
  Error    = 1 << 3,  // 8
  IO       = 1 << 4,  // 16
  Random   = 1 << 5,  // 32
  Network  = 1 << 6,  // 64
  Time     = 1 << 7,  // 128
}

export interface EffectfulFlow<In, Out, E extends Effect> extends Flow<In, Out> {
  readonly effects: E;
}

export function effectful<In, Out, E extends Effect>(
  fn: (input: In) => Out | Promise<Out>,
  effects: E
): EffectfulFlow<In, Out, E> {
  const f = flow(fn, { effects });

  // Добавляем проверку эффектов в runtime
  if (globalConfig.enforceEffects) {
    return flow(
      async (input: In) => {
        // Проверяем, разрешены ли эффекты в текущем контексте
        const allowedEffects = getCurrentAllowedEffects();

        if ((effects & ~allowedEffects) !== 0) {
          throw new EffectViolationError(
            `Effect violation: required ${effects}, allowed ${allowedEffects}`
          );
        }

        return await f(input);
      },
      { effects }
    ) as EffectfulFlow<In, Out, E>;
  }

  return f as EffectfulFlow<In, Out, E>;
}

// Анализ эффектов для оптимизации
export function analyzeEffects<In, Out>(
  flow: Flow<In, Out>
): Effect {
  const effects = flow.meta?.effects || Effect.None;

  // Чистые функции можно мемоизировать
  if (effects === Effect.None) {
    return Effect.None;
  }

  // Только чтение можно кешировать
  if (effects === Effect.Read) {
    return Effect.Read;
  }

  // Все остальные эффекты требуют осторожности
  return effects;
}
```

---

## 4. Модульная Система

### 4.1 Создание Модуля

```typescript
// src/modules/database.module.ts

import { module, Module } from '@holon/flow';
import { Pool } from 'pg';

export interface DatabaseExtensions {
  db: {
    query<T>(sql: string, params?: any[]): Promise<T[]>;
    transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
    users: UserRepository;
    orders: OrderRepository;
  };
}

export const databaseModule: Module<DatabaseExtensions> = module(
  Symbol.for('database'),
  async (ctx) => {
    // Создаём пул соединений
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    // Проверяем соединение
    await pool.query('SELECT 1');

    // Создаём репозитории
    const users = createUserRepository(pool);
    const orders = createOrderRepository(pool);

    // Возвращаем расширения контекста
    return {
      db: {
        async query<T>(sql: string, params?: any[]): Promise<T[]> {
          const result = await pool.query(sql, params);
          return result.rows;
        },

        async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
          const client = await pool.connect();

          try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        },

        users,
        orders
      }
    };
  },
  {
    version: '1.0.0',
    dependencies: []
  }
);
```

### 4.2 Загрузка и Использование Модулей

```typescript
// src/bootstrap.ts

import { context } from '@holon/flow';
import { databaseModule } from './modules/database.module';
import { cacheModule } from './modules/cache.module';
import { authModule } from './modules/auth.module';

export async function bootstrap() {
  // Создаём базовый контекст
  let ctx = context({
    env: process.env,
    startTime: Date.now()
  });

  // Загружаем модули в правильном порядке
  ctx = await ctx.use(databaseModule);
  ctx = await ctx.use(cacheModule);
  ctx = await ctx.use(authModule); // Зависит от database

  // Проверяем, что все модули загружены
  if (!ctx.db) throw new Error('Database module failed to load');
  if (!ctx.cache) throw new Error('Cache module failed to load');
  if (!ctx.auth) throw new Error('Auth module failed to load');

  return ctx;
}
```

---

## 5. Практические Примеры

### 5.1 REST API Server

```typescript
// src/api/server.ts

import { flow } from '@holon/flow';
import express from 'express';
import { bootstrap } from '../bootstrap';

// Определяем routes как Flow
const routes = {
  'GET /users': flow(async (ctx: AppContext, req: Request) => {
    const users = await ctx.db.users.findAll({
      limit: req.query.limit || 10,
      offset: req.query.offset || 0
    });
    return { users };
  }),

  'GET /users/:id': flow(async (ctx: AppContext, req: Request) => {
    const user = await ctx.db.users.findById(req.params.id);
    if (!user) throw new NotFoundError('User not found');
    return { user };
  }),

  'POST /users': flow(async (ctx: AppContext, req: Request) => {
    const user = await createUser(ctx, req.body);
    return { status: 201, user };
  }),

  'PUT /users/:id': flow(async (ctx: AppContext, req: Request) => {
    const user = await updateUser(ctx, req.params.id, req.body);
    return { user };
  }),

  'DELETE /users/:id': flow(async (ctx: AppContext, req: Request) => {
    await deleteUser(ctx, req.params.id);
    return { status: 204 };
  })
};

// Express adapter
function createExpressApp(ctx: AppContext) {
  const app = express();

  app.use(express.json());

  // Регистрируем routes
  for (const [pattern, handler] of Object.entries(routes)) {
    const [method, path] = pattern.split(' ');

    app[method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](
      path,
      async (req, res) => {
        try {
          const result = await handler(ctx, req);
          const status = result.status || 200;
          res.status(status).json(result);
        } catch (error) {
          handleError(res, error);
        }
      }
    );
  }

  return app;
}

// Запуск сервера
async function main() {
  const ctx = await bootstrap();
  const app = createExpressApp(ctx);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

main().catch(console.error);
```

### 5.2 Background Job Processing

```typescript
// src/workers/email.worker.ts

import { flow } from '@holon/flow';
import { bootstrap } from '../bootstrap';

// Email sending Flow
const sendEmail = flow(async (ctx: AppContext, job: EmailJob) => {
  const { to, subject, template, data } = job;

  // Рендерим шаблон
  const html = await ctx.templates.render(template, data);

  // Отправляем через провайдера
  const result = await ctx.email.send({
    to,
    subject,
    html,
    from: 'noreply@example.com'
  });

  // Логируем результат
  await ctx.db.emailLogs.create({
    jobId: job.id,
    to,
    subject,
    status: result.success ? 'sent' : 'failed',
    messageId: result.messageId,
    timestamp: Date.now()
  });

  return result;
});

// Worker process
async function worker() {
  const ctx = await bootstrap();

  // Подписываемся на очередь
  const queue = ctx.queue.get('emails');

  queue.process('send-email', async (job) => {
    try {
      const result = await sendEmail(ctx, job.data);

      // Обновляем статус job
      await job.updateProgress(100);

      return result;
    } catch (error) {
      // Логируем ошибку
      ctx.logger.error('Email sending failed', {
        job: job.id,
        error: error.message
      });

      // Retry logic встроена в queue
      throw error;
    }
  });

  console.log('Email worker started');
}

worker().catch(console.error);
```

### 5.3 Real-time WebSocket Server

```typescript
// src/api/websocket.ts

import { flow } from '@holon/flow';
import { WebSocketServer } from 'ws';

// Message processing Flow
const processMessage = flow(async (
  ctx: AppContext,
  socket: WebSocket,
  message: Message
) => {
  switch (message.type) {
    case 'subscribe':
      return handleSubscribe(ctx, socket, message.channel);

    case 'unsubscribe':
      return handleUnsubscribe(ctx, socket, message.channel);

    case 'message':
      return handleMessage(ctx, socket, message);

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
});

// WebSocket server
export function createWebSocketServer(ctx: AppContext) {
  const wss = new WebSocketServer({ port: 8080 });

  wss.on('connection', (socket) => {
    const clientId = generateId();

    // Store client context
    const clientCtx = ctx.with({
      clientId,
      socket,
      subscriptions: new Set<string>()
    });

    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const result = await processMessage(clientCtx, socket, message);

        socket.send(JSON.stringify({
          id: message.id,
          result
        }));
      } catch (error) {
        socket.send(JSON.stringify({
          error: error.message
        }));
      }
    });

    socket.on('close', () => {
      // Cleanup subscriptions
      for (const channel of clientCtx.subscriptions) {
        ctx.pubsub.unsubscribe(channel, clientId);
      }
    });
  });

  return wss;
}
```

---

## 6. Тестирование

### 6.1 Unit Testing

```typescript
// tests/flows/users.test.ts

import { flow, context } from '@holon/flow';
import { createUser } from '../../src/flows/users/create.flow';

describe('User Creation Flow', () => {
  let ctx: TestContext;

  beforeEach(() => {
    // Создаём тестовый контекст с моками
    ctx = context({
      db: {
        users: {
          findByEmail: jest.fn(),
          create: jest.fn()
        }
      },
      events: {
        emit: jest.fn()
      },
      queue: {
        add: jest.fn()
      }
    });
  });

  test('should create user successfully', async () => {
    // Arrange
    const input = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123'
    };

    ctx.db.users.findByEmail.mockResolvedValue(null);
    ctx.db.users.create.mockResolvedValue({
      id: '123',
      ...input,
      password: 'hashed'
    });

    // Act
    const result = await createUser(ctx, input);

    // Assert
    expect(result).toHaveProperty('id', '123');
    expect(ctx.db.users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        name: 'Test User'
      })
    );
    expect(ctx.events.emit).toHaveBeenCalledWith(
      'user.created',
      expect.any(Object)
    );
    expect(ctx.queue.add).toHaveBeenCalledWith(
      'send-welcome-email',
      { userId: '123' }
    );
  });

  test('should throw error if email exists', async () => {
    // Arrange
    ctx.db.users.findByEmail.mockResolvedValue({ id: 'existing' });

    // Act & Assert
    await expect(
      createUser(ctx, { email: 'existing@example.com' })
    ).rejects.toThrow('Email already exists');
  });
});
```

### 6.2 Integration Testing

```typescript
// tests/integration/api.test.ts

import request from 'supertest';
import { createApp } from '../../src/api/app';
import { createTestContext } from '../helpers';

describe('API Integration Tests', () => {
  let app: Express;
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    app = createApp(ctx);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('POST /users', () => {
    test('should create user and return 201', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          email: 'newuser@example.com',
          name: 'New User',
          password: 'secure123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe('newuser@example.com');

      // Проверяем, что пользователь действительно создан
      const user = await ctx.db.users.findByEmail('newuser@example.com');
      expect(user).toBeTruthy();
    });

    test('should return 400 for invalid data', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          email: 'invalid-email',
          name: 'A' // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});
```

---

## 7. Производственное Развертывание

### 7.1 Dockerfile

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build
RUN npm run build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Run as non-root
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### 7.2 Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: holon-app
  namespace: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: holon-app
  template:
    metadata:
      labels:
        app: holon-app
    spec:
      containers:
      - name: app
        image: holon-app:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: holon-app
  namespace: production
spec:
  selector:
    app: holon-app
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: holon-app
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: holon-app
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 7.3 Monitoring и Observability

```typescript
// src/monitoring/metrics.ts

import { flow } from '@holon/flow';
import prometheus from 'prom-client';

// Метрики
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

const flowExecutionTime = new prometheus.Histogram({
  name: 'flow_execution_time_seconds',
  help: 'Execution time of flows',
  labelNames: ['flow_name']
});

const flowErrorRate = new prometheus.Counter({
  name: 'flow_errors_total',
  help: 'Total number of flow errors',
  labelNames: ['flow_name', 'error_type']
});

// Middleware для метрик
export const metricsMiddleware = flow(async (ctx: Context, req: Request, next: Flow) => {
  const start = Date.now();

  try {
    const result = await next(req);

    httpRequestDuration
      .labels(req.method, req.route, result.status || 200)
      .observe((Date.now() - start) / 1000);

    return result;
  } catch (error) {
    httpRequestDuration
      .labels(req.method, req.route, 500)
      .observe((Date.now() - start) / 1000);

    throw error;
  }
});

// Endpoint для Prometheus
export const metricsEndpoint = flow(async () => {
  const metrics = await prometheus.register.metrics();
  return {
    headers: { 'Content-Type': prometheus.register.contentType },
    body: metrics
  };
});
```

---

Это руководство предоставляет полную картину реализации Holon Flow от базовых концепций до производственного развертывания.