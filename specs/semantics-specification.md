# Спецификация Модуля @holon/semantics

**Version:** 1.0.0
**Status:** Specification
**Date:** 2025-10-04

## Обзор

Модуль `@holon/semantics` добавляет семантический слой к Holon Flow — возможность описывать что означают данные и операции, делая код самодокументируемым и понятным как для людей, так и для систем.

## Философия

> "Код должен не только работать правильно, но и объяснять, что он делает и почему."

Семантика в Holon Flow позволяет:
- **Описывать смысл данных** — единицы измерения, диапазоны, ограничения
- **Документировать трансформации** — что сохраняется, что изменяется
- **Проверять инварианты** — предусловия и постусловия
- **Автоматически генерировать документацию** — из семантических аннотаций
- **Обеспечивать совместимость** — проверка семантической корректности композиции

## API

### Основные Типы

```typescript
/**
 * Concept — единица смысла в семантическом пространстве
 */
export interface Concept {
  // Уникальный идентификатор концепта
  readonly id: symbol;

  // Человекочитаемое имя
  readonly name: string;

  // Подробное описание
  readonly description?: string;

  // Единица измерения (если применимо)
  readonly unit?: string;

  // Допустимый диапазон значений
  readonly range?: [min: number | string, max: number | string];

  // Тип данных
  readonly dataType?: DataType;

  // Связи с другими концептами
  readonly relations?: ConceptRelation[];

  // Примеры значений
  readonly examples?: any[];

  // Валидатор значений
  readonly validator?: (value: any) => boolean;
}

/**
 * Тип данных концепта
 */
export enum DataType {
  Number = 'number',
  String = 'string',
  Boolean = 'boolean',
  Date = 'date',
  Array = 'array',
  Object = 'object',
  Custom = 'custom'
}

/**
 * Связь между концептами
 */
export interface ConceptRelation {
  type: RelationType;
  target: symbol;
  description?: string;
}

export enum RelationType {
  IsA = 'is-a',           // Наследование
  PartOf = 'part-of',     // Композиция
  RelatedTo = 'related-to', // Ассоциация
  ConvertibleTo = 'convertible-to', // Преобразование
  OppositeOf = 'opposite-of' // Противоположность
}

/**
 * Transformation — описание преобразования
 */
export interface Transformation {
  // Тип преобразования
  readonly type: string;

  // Описание для людей
  readonly description: string;

  // Какие свойства сохраняются
  readonly preserves?: string[];

  // Какие свойства изменяются
  readonly modifies?: string[];

  // Какие свойства теряются
  readonly loses?: string[];

  // Обратимо ли преобразование
  readonly reversible?: boolean;

  // Сложность преобразования
  readonly complexity?: ComplexityClass;
}

export enum ComplexityClass {
  Constant = 'O(1)',
  Logarithmic = 'O(log n)',
  Linear = 'O(n)',
  Linearithmic = 'O(n log n)',
  Quadratic = 'O(n²)',
  Cubic = 'O(n³)',
  Exponential = 'O(2^n)'
}

/**
 * SemanticFlow — Flow с семантическими аннотациями
 */
export interface SemanticFlow<In, Out> extends Flow<In, Out> {
  readonly semantics: {
    // Семантика входных данных
    input: Concept | Concept[] | ConceptSchema;

    // Семантика выходных данных
    output: Concept | Concept[] | ConceptSchema;

    // Описание трансформации
    transformation: Transformation;

    // Формальные условия
    preconditions?: Predicate<In>[];
    postconditions?: Predicate2<In, Out>[];
    invariants?: Invariant[];

    // Примеры использования
    examples?: Example<In, Out>[];
  };
}

/**
 * Предикат для проверки условий
 */
export type Predicate<T> = (value: T) => boolean;
export type Predicate2<T, U> = (input: T, output: U) => boolean;

/**
 * Инвариант системы
 */
export interface Invariant {
  name: string;
  description: string;
  check: () => boolean;
}

/**
 * Пример использования
 */
export interface Example<In, Out> {
  input: In;
  output: Out;
  description?: string;
}
```

### Основные Функции

```typescript
/**
 * Добавляет семантику к Flow
 */
export function semantic<In, Out>(
  flow: Flow<In, Out>,
  semantics: SemanticFlow<In, Out>['semantics']
): SemanticFlow<In, Out>;

/**
 * Создаёт концепт
 */
export function concept(
  name: string,
  properties?: Partial<Concept>
): Concept;

/**
 * Создаёт числовой концепт
 */
export function numericConcept(
  name: string,
  unit: string,
  range?: [number, number],
  properties?: Partial<Concept>
): Concept;

/**
 * Создаёт концепт для enum
 */
export function enumConcept<T extends string>(
  name: string,
  values: T[],
  properties?: Partial<Concept>
): Concept;

/**
 * Проверяет семантическую совместимость
 */
export function isCompatible(
  output: Concept,
  input: Concept
): boolean;

/**
 * Композиция семантики
 */
export function composeSemantics<A, B, C>(
  first: SemanticFlow<A, B>,
  second: SemanticFlow<B, C>
): SemanticFlow<A, C>;

/**
 * Генерирует документацию из семантики
 */
export function generateDocs(
  flow: SemanticFlow<any, any>
): Documentation;

/**
 * Валидирует данные против концепта
 */
export function validate(
  value: any,
  concept: Concept
): ValidationResult;
```

### Стандартные Концепты

```typescript
// Временные концепты
export const timestamp = numericConcept('timestamp', 'milliseconds', [0, Infinity]);
export const duration = numericConcept('duration', 'milliseconds', [0, Infinity]);
export const date = concept('date', { dataType: DataType.Date });

// Физические величины
export const temperature = {
  celsius: numericConcept('temperature', 'celsius', [-273.15, Infinity]),
  fahrenheit: numericConcept('temperature', 'fahrenheit', [-459.67, Infinity]),
  kelvin: numericConcept('temperature', 'kelvin', [0, Infinity])
};

export const distance = {
  meters: numericConcept('distance', 'meters', [0, Infinity]),
  kilometers: numericConcept('distance', 'kilometers', [0, Infinity]),
  miles: numericConcept('distance', 'miles', [0, Infinity])
};

// Данные
export const percentage = numericConcept('percentage', '%', [0, 100]);
export const probability = numericConcept('probability', '', [0, 1]);
export const count = numericConcept('count', '', [0, Infinity]);

// Текст
export const email = concept('email', {
  dataType: DataType.String,
  validator: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
});

export const url = concept('url', {
  dataType: DataType.String,
  validator: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
});

// Идентификаторы
export const uuid = concept('uuid', {
  dataType: DataType.String,
  validator: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
});
```

## Примеры Использования

### Базовый Пример

```typescript
import { flow } from '@holon/flow';
import { semantic, temperature } from '@holon/semantics';

// Flow для конвертации температуры
const celsiusToFahrenheit = flow((celsius: number) =>
  celsius * 9/5 + 32
);

// Добавляем семантику
const semanticConverter = semantic(celsiusToFahrenheit, {
  input: temperature.celsius,
  output: temperature.fahrenheit,
  transformation: {
    type: 'unit_conversion',
    description: 'Convert temperature from Celsius to Fahrenheit',
    preserves: ['temperature_value'],
    modifies: ['unit', 'scale'],
    reversible: true,
    complexity: ComplexityClass.Constant
  },
  preconditions: [
    (celsius) => celsius >= -273.15 // Абсолютный ноль
  ],
  postconditions: [
    (celsius, fahrenheit) =>
      Math.abs((celsius * 9/5 + 32) - fahrenheit) < 0.001
  ],
  examples: [
    { input: 0, output: 32, description: 'Freezing point of water' },
    { input: 100, output: 212, description: 'Boiling point of water' },
    { input: 37, output: 98.6, description: 'Normal body temperature' }
  ]
});
```

### Композиция с Проверкой Совместимости

```typescript
import { composeSemantics, isCompatible } from '@holon/semantics';

// Первый Flow: текст -> число
const parseNumber = semantic(
  flow((text: string) => parseFloat(text)),
  {
    input: concept('numeric_string'),
    output: concept('number'),
    transformation: {
      type: 'parsing',
      description: 'Parse string to number'
    }
  }
);

// Второй Flow: число -> процент
const toPercentage = semantic(
  flow((value: number) => value * 100),
  {
    input: concept('ratio', { range: [0, 1] }),
    output: percentage,
    transformation: {
      type: 'scaling',
      description: 'Convert ratio to percentage'
    }
  }
);

// Проверяем совместимость
if (isCompatible(parseNumber.semantics.output, toPercentage.semantics.input)) {
  // Безопасная композиция
  const combined = composeSemantics(parseNumber, toPercentage);
} else {
  console.error('Incompatible semantics!');
}
```

### Сложные Структуры Данных

```typescript
// Схема для объекта
const userSchema = {
  id: uuid,
  email: email,
  age: numericConcept('age', 'years', [0, 150]),
  registeredAt: timestamp,
  preferences: {
    theme: enumConcept('theme', ['light', 'dark', 'auto']),
    notifications: concept('boolean')
  }
};

// Flow с объектной семантикой
const processUser = semantic(
  flow((user: User) => ({
    ...user,
    ageGroup: user.age < 18 ? 'minor' : 'adult'
  })),
  {
    input: userSchema,
    output: {
      ...userSchema,
      ageGroup: enumConcept('age_group', ['minor', 'adult'])
    },
    transformation: {
      type: 'enrichment',
      description: 'Add age group classification',
      preserves: ['id', 'email', 'age', 'registeredAt', 'preferences'],
      modifies: []
    }
  }
);
```

### Генерация Документации

```typescript
import { generateDocs } from '@holon/semantics';

const docs = generateDocs(semanticConverter);

console.log(docs);
// Output:
// {
//   name: 'celsiusToFahrenheit',
//   description: 'Convert temperature from Celsius to Fahrenheit',
//   input: {
//     type: 'number',
//     unit: 'celsius',
//     range: [-273.15, Infinity],
//     description: 'Temperature in Celsius'
//   },
//   output: {
//     type: 'number',
//     unit: 'fahrenheit',
//     range: [-459.67, Infinity],
//     description: 'Temperature in Fahrenheit'
//   },
//   examples: [
//     '0°C → 32°F (Freezing point of water)',
//     '100°C → 212°F (Boiling point of water)',
//     '37°C → 98.6°F (Normal body temperature)'
//   ],
//   complexity: 'O(1)',
//   reversible: true
// }
```

### Валидация в Runtime

```typescript
import { validate } from '@holon/semantics';

const emailFlow = semantic(
  flow((email: string) => email.toLowerCase()),
  {
    input: email,
    output: email,
    transformation: {
      type: 'normalization',
      description: 'Convert email to lowercase'
    }
  }
);

// В режиме разработки автоматически проверяются условия
if (process.env.NODE_ENV === 'development') {
  const input = 'NOT_AN_EMAIL';
  const validation = validate(input, email);

  if (!validation.valid) {
    console.error('Invalid input:', validation.errors);
    // Output: Invalid input: ['Value does not match email format']
  }
}
```

## Интеграция с Другими Модулями

### С @holon/telos

```typescript
import { withObjectives } from '@holon/telos';
import { semantic } from '@holon/semantics';

// Flow с семантикой и целями
const smartFlow = withObjectives(
  semantic(myFlow, {
    input: inputConcept,
    output: outputConcept,
    transformation: transformation
  }),
  [
    {
      name: 'semantic_correctness',
      evaluate: (ctx, result) => {
        // Проверяем, что результат соответствует семантике
        const validation = validate(result, outputConcept);
        return validation.valid ? 1 : 0;
      }
    }
  ]
);
```

### С @holon/effects

```typescript
import { effectful, Effect } from '@holon/effects';
import { semantic } from '@holon/semantics';

// Семантика для эффектов
const fileFlow = semantic(
  effectful(
    (path: string) => readFile(path),
    Effect.IO | Effect.Async
  ),
  {
    input: concept('file_path', {
      dataType: DataType.String,
      validator: (path) => existsSync(path)
    }),
    output: concept('file_content', {
      dataType: DataType.String
    }),
    transformation: {
      type: 'io_operation',
      description: 'Read file from disk',
      loses: ['file_metadata'],
      reversible: false
    }
  }
);
```

## Семантические Паттерны

### Конвертеры Единиц

```typescript
function createUnitConverter(
  fromUnit: Concept,
  toUnit: Concept,
  formula: (value: number) => number
): SemanticFlow<number, number> {
  return semantic(flow(formula), {
    input: fromUnit,
    output: toUnit,
    transformation: {
      type: 'unit_conversion',
      description: `Convert ${fromUnit.name} to ${toUnit.name}`,
      preserves: ['value'],
      modifies: ['unit'],
      reversible: true,
      complexity: ComplexityClass.Constant
    }
  });
}

// Библиотека конвертеров
const converters = {
  celsius_to_fahrenheit: createUnitConverter(
    temperature.celsius,
    temperature.fahrenheit,
    c => c * 9/5 + 32
  ),
  meters_to_feet: createUnitConverter(
    distance.meters,
    distance.feet,
    m => m * 3.28084
  )
};
```

### Валидаторы

```typescript
function createValidator<T>(
  concept: Concept,
  additionalChecks?: Predicate<T>[]
): SemanticFlow<T, T> {
  return semantic(
    flow((value: T) => {
      const validation = validate(value, concept);
      if (!validation.valid) {
        throw new Error(`Invalid ${concept.name}: ${validation.errors.join(', ')}`);
      }

      for (const check of additionalChecks || []) {
        if (!check(value)) {
          throw new Error(`Failed additional validation for ${concept.name}`);
        }
      }

      return value;
    }),
    {
      input: concept,
      output: concept,
      transformation: {
        type: 'validation',
        description: `Validate ${concept.name}`,
        preserves: ['*']
      }
    }
  );
}
```

## Best Practices

1. **Используйте стандартные концепты** когда возможно
2. **Документируйте трансформации** подробно
3. **Добавляйте примеры** для сложных Flow
4. **Проверяйте совместимость** при композиции
5. **Валидируйте в development** режиме
6. **Генерируйте документацию** автоматически

## Производительность

- Добавление семантики: ~10ns overhead
- Валидация простого концепта: ~50ns
- Валидация сложной схемы: ~1-10μs
- Генерация документации: ~100μs

## Roadmap

- v1.1: Интеграция с TypeScript для автоматического извлечения семантики
- v1.2: Визуальный редактор концептов
- v1.3: Онтологии и knowledge graphs
- v2.0: Автоматический вывод семантики через ML

---

*Семантика делает код понятным.*