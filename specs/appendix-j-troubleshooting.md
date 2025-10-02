# Приложение J: Руководство по Устранению Неполадок

**Version:** 10.0.0
**Status:** Complete Troubleshooting Guide
**Date:** 2025-09-29

## Оглавление

- [1. Диагностика Проблем](#1-диагностика-проблем)
- [2. Частые Проблемы и Решения](#2-частые-проблемы-и-решения)
- [3. Отладка Flow](#3-отладка-flow)
- [4. Проблемы Производительности](#4-проблемы-производительности)
- [5. Проблемы Композиции](#5-проблемы-композиции)
- [6. Проблемы Контекста](#6-проблемы-контекста)
- [7. Асинхронные Проблемы](#7-асинхронные-проблемы)
- [8. Проблемы Модулей](#8-проблемы-модулей)
- [9. Инструменты Диагностики](#9-инструменты-диагностики)
- [10. Экстренное Восстановление](#10-экстренное-восстановление)

---

## 1. Диагностика Проблем

### 1.1 Систематический Подход

```typescript
/**
 * Алгоритм диагностики проблем в Holon Flow
 */
class DiagnosticApproach {
  // Шаг 1: Идентификация симптомов
  identifySymptoms(): Symptoms {
    return {
      errorMessages: this.collectErrors(),
      performanceMetrics: this.measurePerformance(),
      behavioralAnomalies: this.detectAnomalies(),
      resourceUsage: this.checkResources()
    };
  }

  // Шаг 2: Изоляция проблемы
  isolateProblem(symptoms: Symptoms): ProblemScope {
    if (symptoms.errorMessages.length > 0) {
      return this.analyzeErrors(symptoms.errorMessages);
    }

    if (symptoms.performanceMetrics.degraded) {
      return this.profilePerformance();
    }

    return this.deepDive(symptoms);
  }

  // Шаг 3: Формирование гипотез
  formHypotheses(problem: ProblemScope): Hypothesis[] {
    const hypotheses = [];

    // Анализ стека вызовов
    if (problem.stackTrace) {
      hypotheses.push(this.analyzeStackTrace(problem.stackTrace));
    }

    // Анализ изменений
    if (problem.recentChanges) {
      hypotheses.push(this.analyzeChanges(problem.recentChanges));
    }

    return hypotheses;
  }

  // Шаг 4: Проверка и решение
  verifySolution(hypothesis: Hypothesis): Solution {
    const test = this.createMinimalTest(hypothesis);
    const result = this.runTest(test);

    if (result.confirms) {
      return this.implementFix(hypothesis);
    }

    return this.continueInvestigation();
  }
}
```

### 1.2 Чек-лист Диагностики

```typescript
/**
 * Универсальный чек-лист для диагностики
 */
const diagnosticChecklist = {
  // Базовые проверки
  basic: [
    'Проверить версию Holon Flow',
    'Проверить зависимости',
    'Проверить конфигурацию TypeScript',
    'Проверить переменные окружения',
    'Проверить права доступа'
  ],

  // Проверки Flow
  flow: [
    'Flow возвращает ожидаемый тип?',
    'Входные данные корректны?',
    'Композиция правильная?',
    'Контекст передаётся корректно?',
    'Эффекты применяются правильно?'
  ],

  // Проверки производительности
  performance: [
    'Есть ли утечки памяти?',
    'Оптимальна ли композиция?',
    'Используется ли мемоизация?',
    'Корректно ли работает GC?',
    'Есть ли блокирующие операции?'
  ],

  // Проверки асинхронности
  async: [
    'Правильно ли обрабатываются Promise?',
    'Есть ли race conditions?',
    'Корректна ли обработка ошибок?',
    'Используются ли таймауты?',
    'Есть ли deadlocks?'
  ]
};
```

---

## 2. Частые Проблемы и Решения

### 2.1 TypeError: flow is not a function

**Проблема:**
```typescript
// Ошибка
import flow from '@holon/flow';  // Неправильно!
const myFlow = flow(() => 42);
// TypeError: flow is not a function
```

**Решение:**
```typescript
// Правильный импорт
import { flow } from '@holon/flow';  // Правильно!
const myFlow = flow(() => 42);

// Или с default export
import HolonFlow from '@holon/flow';
const myFlow = HolonFlow.flow(() => 42);
```

### 2.2 Flow Composition Type Mismatch

**Проблема:**
```typescript
const addOne = flow((x: number) => x + 1);
const toString = flow((x: string) => x.toUpperCase());

// Type error!
const composed = addOne.pipe(toString);
```

**Решение:**
```typescript
const addOne = flow((x: number) => x + 1);
const toString = flow((x: number) => x.toString());  // Исправлен тип
const toUpper = flow((x: string) => x.toUpperCase());

// Теперь работает
const composed = addOne
  .pipe(toString)
  .pipe(toUpper);
```

### 2.3 Потеря Контекста

**Проблема:**
```typescript
class Service {
  private value = 42;

  getValue = flow(() => this.value);  // this undefined!
}
```

**Решение:**
```typescript
class Service {
  private value = 42;

  // Вариант 1: Arrow function
  getValue = flow(() => this.value);

  // Вариант 2: Bind
  constructor() {
    this.getValue = flow(this.getValue.bind(this));
  }

  // Вариант 3: Контекст как параметр
  getValue = flow((ctx: { service: Service }) =>
    ctx.service.value
  );
}
```

### 2.4 Асинхронные Ошибки Не Перехватываются

**Проблема:**
```typescript
const fetchData = flow(async (url: string) => {
  const response = await fetch(url);
  return response.json();  // Может throw
});

// Ошибка не перехвачена!
fetchData('invalid-url');
```

**Решение:**
```typescript
// Вариант 1: Try-catch внутри Flow
const fetchData = flow(async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    return null;  // Или другое значение по умолчанию
  }
});

// Вариант 2: Error Flow
const withErrorHandling = <In, Out>(
  flow: Flow<In, Out>
): Flow<In, Out | Error> =>
  flow(async (input: In) => {
    try {
      return await flow(input);
    } catch (error) {
      return error as Error;
    }
  });

// Вариант 3: Result Type
type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

const safeFlow = <In, Out>(
  flow: Flow<In, Out>
): Flow<In, Result<Out>> =>
  flow(async (input: In) => {
    try {
      const value = await flow(input);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  });
```

---

## 3. Отладка Flow

### 3.1 Инструменты Отладки

```typescript
/**
 * Утилиты для отладки Flow
 */
class FlowDebugger {
  // Логирование входа/выхода
  static trace<In, Out>(
    name: string,
    flow: Flow<In, Out>
  ): Flow<In, Out> {
    return flow(async (input: In) => {
      console.log(`[${name}] Input:`, input);
      const start = performance.now();

      try {
        const output = await flow(input);
        const duration = performance.now() - start;
        console.log(`[${name}] Output:`, output);
        console.log(`[${name}] Duration: ${duration}ms`);
        return output;
      } catch (error) {
        console.error(`[${name}] Error:`, error);
        throw error;
      }
    });
  }

  // Точки останова
  static breakpoint<In, Out>(
    flow: Flow<In, Out>,
    condition?: (input: In) => boolean
  ): Flow<In, Out> {
    return flow(async (input: In) => {
      if (!condition || condition(input)) {
        debugger;  // Остановка для отладчика
      }
      return flow(input);
    });
  }

  // Профилирование
  static profile<In, Out>(
    flow: Flow<In, Out>
  ): Flow<In, Out> & { stats: Stats } {
    const stats = {
      calls: 0,
      totalTime: 0,
      avgTime: 0,
      minTime: Infinity,
      maxTime: 0
    };

    const profiledFlow = flow(async (input: In) => {
      const start = performance.now();
      const output = await flow(input);
      const duration = performance.now() - start;

      stats.calls++;
      stats.totalTime += duration;
      stats.avgTime = stats.totalTime / stats.calls;
      stats.minTime = Math.min(stats.minTime, duration);
      stats.maxTime = Math.max(stats.maxTime, duration);

      return output;
    }) as Flow<In, Out> & { stats: Stats };

    profiledFlow.stats = stats;
    return profiledFlow;
  }
}
```

### 3.2 Визуализация Композиции

```typescript
/**
 * Визуализация цепочки Flow
 */
class FlowVisualizer {
  // Генерация диаграммы
  static diagram(flow: Flow): string {
    const chain = this.extractChain(flow);

    return chain.map((step, index) => {
      const arrow = index < chain.length - 1 ? ' → ' : '';
      return `[${step.name}]${arrow}`;
    }).join('');
  }

  // Граф зависимостей
  static dependencyGraph(flow: Flow): Graph {
    const nodes = this.extractNodes(flow);
    const edges = this.extractEdges(flow);

    return {
      nodes,
      edges,
      render: () => this.renderGraph(nodes, edges)
    };
  }

  // Интерактивный отладчик
  static interactive(flow: Flow): InteractiveDebugger {
    return new InteractiveDebugger({
      flow,
      ui: 'web',
      features: ['step-through', 'inspect', 'modify']
    });
  }
}

// Использование
const debugFlow = FlowDebugger.trace('myFlow',
  flow((x: number) => x * 2)
    .pipe(flow(x => x + 1))
    .pipe(flow(x => x.toString()))
);

console.log(FlowVisualizer.diagram(debugFlow));
// Output: [multiply] → [add] → [toString]
```

---

## 4. Проблемы Производительности

### 4.1 Обнаружение Утечек Памяти

```typescript
/**
 * Детектор утечек памяти
 */
class MemoryLeakDetector {
  private baseline: MemoryUsage;
  private samples: MemoryUsage[] = [];

  start() {
    this.baseline = process.memoryUsage();
    this.startSampling();
  }

  private startSampling() {
    setInterval(() => {
      const current = process.memoryUsage();
      this.samples.push(current);

      // Анализ тренда
      if (this.samples.length > 10) {
        const trend = this.calculateTrend();
        if (trend.increasing && trend.rate > 1024 * 1024) {  // 1MB/sec
          console.warn('Potential memory leak detected!');
          this.reportLeak();
        }
      }
    }, 1000);
  }

  private calculateTrend() {
    const recent = this.samples.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];

    return {
      increasing: last.heapUsed > first.heapUsed,
      rate: (last.heapUsed - first.heapUsed) / 10  // bytes/sec
    };
  }

  reportLeak() {
    console.log('Memory Leak Report:');
    console.log('Baseline:', this.baseline);
    console.log('Current:', process.memoryUsage());
    console.log('Growth:', this.samples.map(s => s.heapUsed));

    // Создание heap snapshot
    if (global.gc) {
      global.gc();  // Принудительная сборка мусора
    }

    // Анализ объектов
    this.analyzeHeap();
  }

  private analyzeHeap() {
    // Использование v8 heap statistics
    const v8 = require('v8');
    const heapStats = v8.getHeapStatistics();
    console.log('Heap Statistics:', heapStats);
  }
}
```

### 4.2 Оптимизация Медленных Flow

```typescript
/**
 * Автоматический оптимизатор Flow
 */
class FlowOptimizer {
  // Мемоизация
  static memoize<In, Out>(
    flow: Flow<In, Out>,
    keyFn?: (input: In) => string
  ): Flow<In, Out> {
    const cache = new Map<string, Out>();

    return flow((input: In) => {
      const key = keyFn ? keyFn(input) : JSON.stringify(input);

      if (cache.has(key)) {
        return cache.get(key)!;
      }

      const result = flow(input);
      cache.set(key, result);
      return result;
    });
  }

  // Батчинг
  static batch<In, Out>(
    flow: Flow<In[], Out[]>,
    size: number = 100,
    delay: number = 10
  ): Flow<In, Out> {
    const queue: Array<{ input: In; resolve: Function }> = [];
    let timer: NodeJS.Timeout;

    const flush = async () => {
      const batch = queue.splice(0, size);
      if (batch.length === 0) return;

      const inputs = batch.map(item => item.input);
      const outputs = await flow(inputs);

      batch.forEach((item, index) => {
        item.resolve(outputs[index]);
      });
    };

    return flow((input: In) => {
      return new Promise<Out>(resolve => {
        queue.push({ input, resolve });

        clearTimeout(timer);
        timer = setTimeout(flush, delay);

        if (queue.length >= size) {
          flush();
        }
      });
    });
  }

  // Параллелизация
  static parallelize<In, Out>(
    flows: Flow<In, Out>[],
    strategy: 'race' | 'all' = 'all'
  ): Flow<In, Out[]> {
    return flow(async (input: In) => {
      const promises = flows.map(f => f(input));

      if (strategy === 'race') {
        return [await Promise.race(promises)];
      } else {
        return await Promise.all(promises);
      }
    });
  }
}
```

---

## 5. Проблемы Композиции

### 5.1 Циклические Зависимости

**Проблема:**
```typescript
// Циклическая зависимость!
const flowA = flow((x: number) => flowB(x + 1));
const flowB = flow((x: number) => flowA(x - 1));
```

**Решение:**
```typescript
// Вариант 1: Lazy initialization
const createFlowA = () => flow((x: number) => {
  const flowB = createFlowB();
  return flowB(x + 1);
});

const createFlowB = () => flow((x: number) => {
  const flowA = createFlowA();
  return x > 0 ? flowA(x - 1) : x;  // Условие выхода
});

// Вариант 2: Dependency Injection
class FlowSystem {
  private flows = new Map<string, Flow>();

  register(name: string, factory: () => Flow) {
    this.flows.set(name, factory());
  }

  get(name: string): Flow {
    return this.flows.get(name)!;
  }
}
```

### 5.2 Несовместимые Типы в Композиции

```typescript
/**
 * Решение проблем с типами
 */
class TypeSafeComposition {
  // Адаптер для несовместимых типов
  static adapt<In1, Out1, In2, Out2>(
    flow1: Flow<In1, Out1>,
    adapter: (out1: Out1) => In2,
    flow2: Flow<In2, Out2>
  ): Flow<In1, Out2> {
    return flow1
      .pipe(flow(adapter))
      .pipe(flow2);
  }

  // Условная композиция
  static conditional<In, Out>(
    condition: (input: In) => boolean,
    ifTrue: Flow<In, Out>,
    ifFalse: Flow<In, Out>
  ): Flow<In, Out> {
    return flow((input: In) =>
      condition(input) ? ifTrue(input) : ifFalse(input)
    );
  }

  // Безопасная композиция с валидацией
  static safePipe<In, Mid, Out>(
    flow1: Flow<In, Mid>,
    validator: (value: Mid) => boolean,
    flow2: Flow<Mid, Out>
  ): Flow<In, Out | Error> {
    return flow(async (input: In) => {
      const mid = await flow1(input);

      if (!validator(mid)) {
        return new Error(`Validation failed: ${mid}`);
      }

      return flow2(mid);
    });
  }
}
```

---

## 6. Проблемы Контекста

### 6.1 Потеря Контекста

```typescript
/**
 * Решение проблем с контекстом
 */
class ContextProblems {
  // Проблема: контекст не передаётся
  problem() {
    const flow1 = flow((x: number, ctx?: Context) => {
      // ctx может быть undefined!
      const userId = ctx?.get('userId');  // undefined
      return x * 2;
    });
  }

  // Решение: явная передача контекста
  solution1() {
    const withContext = <In, Out>(
      flow: Flow<In, Out>
    ): Flow<{ input: In; ctx: Context }, Out> =>
      flow(({ input, ctx }) =>
        ctx.run(flow, input)
      );
  }

  // Решение: контекст как HOF
  solution2() {
    const contextual = <In, Out>(
      fn: (input: In, ctx: Context) => Out
    ): Flow<In, Out> =>
      flow((input: In) => {
        const ctx = getCurrentContext();  // Получаем из AsyncLocalStorage
        return fn(input, ctx);
      });
  }
}
```

### 6.2 Изоляция Контекста

```typescript
/**
 * Изоляция контекстов между Flow
 */
class ContextIsolation {
  // Создание изолированного контекста
  isolate<In, Out>(
    flow: Flow<In, Out>,
    isolation: IsolationLevel
  ): Flow<In, Out> {
    return flow(async (input: In) => {
      const isolated = this.createIsolatedContext(isolation);

      try {
        return await isolated.run(flow, input);
      } finally {
        isolated.dispose();
      }
    });
  }

  // Уровни изоляции
  createIsolatedContext(level: IsolationLevel): Context {
    switch (level) {
      case 'none':
        return getCurrentContext();

      case 'shallow':
        return getCurrentContext().clone();

      case 'deep':
        return context({});  // Полностью новый контекст

      case 'sandbox':
        return new SandboxContext({
          restrictions: ['network', 'filesystem']
        });
    }
  }
}
```

---

## 7. Асинхронные Проблемы

### 7.1 Race Conditions

```typescript
/**
 * Решение проблем гонки
 */
class RaceConditionSolutions {
  // Проблема: параллельные изменения
  private counter = 0;

  unsafeIncrement = flow(async () => {
    const current = this.counter;
    await delay(10);  // Симуляция async операции
    this.counter = current + 1;  // Race condition!
  });

  // Решение 1: Mutex
  private mutex = new Mutex();

  safeIncrement = flow(async () => {
    await this.mutex.acquire();
    try {
      const current = this.counter;
      await delay(10);
      this.counter = current + 1;
    } finally {
      this.mutex.release();
    }
  });

  // Решение 2: Atomic operations
  private atomicCounter = new AtomicInt32(0);

  atomicIncrement = flow(() => {
    this.atomicCounter.increment();
  });

  // Решение 3: Очередь операций
  private queue = new OperationQueue();

  queuedIncrement = flow(() =>
    this.queue.enqueue(async () => {
      const current = this.counter;
      await delay(10);
      this.counter = current + 1;
    })
  );
}
```

### 7.2 Deadlocks

```typescript
/**
 * Обнаружение и предотвращение deadlocks
 */
class DeadlockPrevention {
  // Детектор deadlock
  detectDeadlock(flows: Flow[]): boolean {
    const graph = this.buildDependencyGraph(flows);
    return this.hasCycle(graph);
  }

  // Предотвращение через timeout
  withTimeout<In, Out>(
    flow: Flow<In, Out>,
    timeout: number
  ): Flow<In, Out> {
    return flow(async (input: In) => {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      );

      return Promise.race([
        flow(input),
        timer
      ]);
    });
  }

  // Иерархическая блокировка
  hierarchicalLock(resources: Resource[]): Lock {
    // Всегда захватываем в одном порядке
    const sorted = resources.sort((a, b) => a.id - b.id);
    return new HierarchicalLock(sorted);
  }
}
```

---

## 8. Проблемы Модулей

### 8.1 Циклические Зависимости Модулей

```typescript
/**
 * Решение циклических зависимостей
 */
class ModuleDependencyResolver {
  // Обнаружение циклов
  detectCycles(modules: Module[]): Cycle[] {
    const graph = this.buildDependencyGraph(modules);
    const cycles = [];

    const visit = (node: string, path: string[] = []) => {
      if (path.includes(node)) {
        cycles.push([...path, node]);
        return;
      }

      const deps = graph[node] || [];
      deps.forEach(dep => visit(dep, [...path, node]));
    };

    Object.keys(graph).forEach(module => visit(module));
    return cycles;
  }

  // Разрешение через lazy loading
  lazyResolve(moduleId: string): Module {
    return new Proxy({} as Module, {
      get(target, prop) {
        if (!target._loaded) {
          target._loaded = true;
          Object.assign(target, loadModule(moduleId));
        }
        return target[prop];
      }
    });
  }
}
```

### 8.2 Конфликты Версий

```typescript
/**
 * Управление версиями модулей
 */
class ModuleVersionManager {
  // Разрешение конфликтов версий
  resolveVersionConflict(
    required: VersionRequirement[],
  ): Version | null {
    const ranges = required.map(r => parseVersionRange(r));

    // Находим пересечение всех диапазонов
    const intersection = ranges.reduce((acc, range) =>
      this.intersectRanges(acc, range)
    );

    if (intersection.empty) {
      console.error('Version conflict:', required);
      return null;
    }

    return intersection.max;  // Берём максимальную совместимую версию
  }

  // Изоляция версий
  isolateVersions(modules: Module[]): IsolatedModules {
    const isolated = new Map<string, Map<Version, Module>>();

    modules.forEach(module => {
      const name = module.name;
      const version = module.version;

      if (!isolated.has(name)) {
        isolated.set(name, new Map());
      }

      isolated.get(name)!.set(version, module);
    });

    return new IsolatedModules(isolated);
  }
}
```

---

## 9. Инструменты Диагностики

### 9.1 CLI Инструменты

```bash
# Диагностика системы
holon doctor

# Проверка конфигурации
holon config --check

# Анализ Flow
holon analyze src/flows/

# Профилирование
holon profile --flow=myFlow --iterations=1000

# Отладка с трассировкой
holon debug --trace src/main.ts

# Проверка зависимостей
holon deps --check-cycles

# Мониторинг в реальном времени
holon monitor --port=3000

# Генерация отчёта о проблемах
holon report --output=diagnostics.html
```

### 9.2 Runtime Диагностика

```typescript
/**
 * Встроенная диагностика во время выполнения
 */
class RuntimeDiagnostics {
  // Автоматическая диагностика при ошибках
  static enableAutoDiagnostics() {
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.diagnose(error);
      this.suggestFixes(error);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      this.diagnose(reason);
    });
  }

  // Диагностика конкретной ошибки
  private static diagnose(error: any) {
    const diagnosis = {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      context: this.gatherContext(),
      suggestions: this.generateSuggestions(error)
    };

    console.log('Diagnosis:', diagnosis);

    // Сохранение для последующего анализа
    this.saveDiagnosis(diagnosis);
  }

  // Сбор контекста
  private static gatherContext() {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      versions: process.versions,
      env: process.env
    };
  }

  // Генерация предложений по исправлению
  private static generateSuggestions(error: any): string[] {
    const suggestions = [];

    if (error.message.includes('not a function')) {
      suggestions.push('Check import statements');
      suggestions.push('Verify function is exported');
    }

    if (error.message.includes('Cannot read property')) {
      suggestions.push('Check for null/undefined values');
      suggestions.push('Use optional chaining (?.)');
    }

    if (error.message.includes('out of memory')) {
      suggestions.push('Increase heap size: node --max-old-space-size=4096');
      suggestions.push('Check for memory leaks');
      suggestions.push('Use streaming for large data');
    }

    return suggestions;
  }
}
```

### 9.3 Визуальная Диагностика

```typescript
/**
 * Web-интерфейс для диагностики
 */
class DiagnosticDashboard {
  start(port: number = 3000) {
    const app = express();

    // Главная страница
    app.get('/', (req, res) => {
      res.send(this.renderDashboard());
    });

    // API endpoints
    app.get('/api/flows', (req, res) => {
      res.json(this.getFlowsInfo());
    });

    app.get('/api/performance', (req, res) => {
      res.json(this.getPerformanceMetrics());
    });

    app.get('/api/errors', (req, res) => {
      res.json(this.getRecentErrors());
    });

    // WebSocket для real-time обновлений
    const ws = new WebSocket.Server({ port: port + 1 });
    ws.on('connection', (socket) => {
      this.streamMetrics(socket);
    });

    app.listen(port, () => {
      console.log(`Diagnostic dashboard: http://localhost:${port}`);
    });
  }

  private renderDashboard(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Holon Flow Diagnostics</title>
        <style>
          body { font-family: monospace; background: #1e1e1e; color: #fff; }
          .metric { padding: 10px; margin: 10px; background: #2d2d2d; }
          .error { color: #ff6b6b; }
          .warning { color: #ffd93d; }
          .success { color: #6bcf7f; }
        </style>
      </head>
      <body>
        <h1>Holon Flow Diagnostics</h1>
        <div id="metrics"></div>
        <div id="flows"></div>
        <div id="errors"></div>
        <script>
          // Real-time updates via WebSocket
          const ws = new WebSocket('ws://localhost:${port + 1}');
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            updateDashboard(data);
          };
        </script>
      </body>
      </html>
    `;
  }
}
```

---

## 10. Экстренное Восстановление

### 10.1 Аварийный Режим

```typescript
/**
 * Процедуры экстренного восстановления
 */
class EmergencyRecovery {
  // Включение аварийного режима
  static enableEmergencyMode() {
    console.warn('EMERGENCY MODE ACTIVATED');

    // Отключение всех необязательных функций
    this.disableNonCritical();

    // Включение расширенного логирования
    this.enableVerboseLogging();

    // Запуск диагностики
    this.runDiagnostics();

    // Создание точки восстановления
    this.createRestorePoint();
  }

  // Откат к последней рабочей версии
  static rollback() {
    const lastKnownGood = this.findLastKnownGood();

    if (lastKnownGood) {
      console.log('Rolling back to:', lastKnownGood.version);
      this.restoreState(lastKnownGood);
      this.restart();
    } else {
      console.error('No known good state found');
      this.factoryReset();
    }
  }

  // Сброс к заводским настройкам
  static factoryReset() {
    console.warn('FACTORY RESET');

    // Сохранение критических данных
    const critical = this.backupCriticalData();

    // Очистка всего состояния
    this.clearAllState();

    // Переинициализация
    this.reinitialize();

    // Восстановление критических данных
    this.restoreCriticalData(critical);
  }

  // Автоматическое восстановление
  static autoRecover() {
    const strategies = [
      () => this.restartFailedFlows(),
      () => this.clearCaches(),
      () => this.reconnectServices(),
      () => this.rebuildIndices(),
      () => this.rollback()
    ];

    for (const strategy of strategies) {
      try {
        console.log('Trying recovery strategy:', strategy.name);
        strategy();

        if (this.isSystemHealthy()) {
          console.log('Recovery successful');
          return;
        }
      } catch (error) {
        console.error('Strategy failed:', error);
      }
    }

    console.error('All recovery strategies failed');
    this.enableEmergencyMode();
  }
}
```

### 10.2 Контрольный Список Восстановления

```typescript
/**
 * Пошаговое восстановление системы
 */
const recoveryChecklist = {
  immediate: [
    '1. Остановить все активные процессы',
    '2. Создать backup текущего состояния',
    '3. Проверить логи на критические ошибки',
    '4. Изолировать проблемный компонент'
  ],

  diagnostic: [
    '5. Запустить holon doctor',
    '6. Проверить целостность файлов',
    '7. Валидировать конфигурацию',
    '8. Проверить зависимости'
  ],

  recovery: [
    '9. Попробовать перезапуск компонента',
    '10. Очистить кеши и временные файлы',
    '11. Переинициализировать подключения',
    '12. Восстановить из последнего backup'
  ],

  validation: [
    '13. Запустить тесты критических путей',
    '14. Проверить производительность',
    '15. Мониторить систему 30 минут',
    '16. Документировать инцидент'
  ]
};
```

---

## Заключение

Эффективное устранение неполадок в Holon Flow требует:

1. **Систематического Подхода** — следование чёткому алгоритму диагностики
2. **Правильных Инструментов** — использование встроенных средств отладки
3. **Понимания Архитектуры** — знание принципов работы Flow
4. **Проактивного Мониторинга** — обнаружение проблем до их критичности
5. **Готовности к Восстановлению** — наличие планов экстренного восстановления

### Золотые Правила Отладки

1. **Воспроизводимость** — всегда создавайте минимальный воспроизводимый пример
2. **Изоляция** — изолируйте проблему до минимального компонента
3. **Логирование** — добавляйте достаточно логов, но не переусердствуйте
4. **Версионирование** — всегда знайте, какая версия работала
5. **Документирование** — записывайте решения для будущего

---

## Ссылки

- [Главная спецификация](01-holon-flow.md)
- [Тестирование](appendix-i-testing.md)
- [Паттерны](appendix-c-patterns.md)
- [API Reference](appendix-b-api.md)
- [Глоссарий](glossary.md)

**[К оглавлению](README.md)**