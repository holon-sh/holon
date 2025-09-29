import { describe, expect, it } from 'vitest';
import { flow } from '../../src/flow.js';
import type { Flow } from '../../src/types.js';

describe('C.3 State Management Patterns', () => {
  describe('State Machine Pattern', () => {
    it('should implement a basic state machine', async () => {
      type State = 'idle' | 'loading' | 'loaded' | 'error';
      type Event = { type: 'FETCH' } | { type: 'SUCCESS' } | { type: 'FAILURE' } | { type: 'RESET' };

      interface StateMachine {
        state: State;
        data?: any;
        error?: string;
      }

      const transitions: Record<State, Partial<Record<Event['type'], State>>> = {
        idle: { FETCH: 'loading' },
        loading: { SUCCESS: 'loaded', FAILURE: 'error' },
        loaded: { FETCH: 'loading', RESET: 'idle' },
        error: { FETCH: 'loading', RESET: 'idle' },
      };

      const stateMachine = flow((input: { machine: StateMachine; event: Event }): StateMachine => {
        const { machine, event } = input;
        const nextState = transitions[machine.state][event.type];

        if (!nextState) {
          return machine; // No valid transition
        }

        switch (event.type) {
          case 'SUCCESS':
            return { state: nextState, data: 'Loaded data' };
          case 'FAILURE':
            return { state: nextState, error: 'Failed to load' };
          case 'RESET':
            return { state: nextState };
          default:
            return { state: nextState, data: machine.data, error: machine.error };
        }
      });

      let machine: StateMachine = { state: 'idle' };

      machine = await stateMachine({ machine, event: { type: 'FETCH' } });
      expect(machine.state).toBe('loading');

      machine = await stateMachine({ machine, event: { type: 'SUCCESS' } });
      expect(machine.state).toBe('loaded');
      expect(machine.data).toBe('Loaded data');

      machine = await stateMachine({ machine, event: { type: 'RESET' } });
      expect(machine.state).toBe('idle');
      expect(machine.data).toBeUndefined();
    });

    it('should handle complex state transitions with guards', async () => {
      interface Context {
        attempts: number;
        maxAttempts: number;
      }

      type State = 'idle' | 'authenticating' | 'authenticated' | 'failed' | 'locked';

      interface AuthMachine {
        state: State;
        context: Context;
      }

      const authStateMachine = flow((input: { machine: AuthMachine; event: any }): AuthMachine => {
        const { machine, event } = input;

        switch (machine.state) {
          case 'idle':
            if (event.type === 'LOGIN') {
              return {
                state: 'authenticating',
                context: machine.context,
              };
            }
            break;

          case 'authenticating':
            if (event.type === 'SUCCESS') {
              return {
                state: 'authenticated',
                context: { ...machine.context, attempts: 0 },
              };
            }
            if (event.type === 'FAILURE') {
              const newAttempts = machine.context.attempts + 1;
              if (newAttempts >= machine.context.maxAttempts) {
                return {
                  state: 'locked',
                  context: { ...machine.context, attempts: newAttempts },
                };
              }
              return {
                state: 'failed',
                context: { ...machine.context, attempts: newAttempts },
              };
            }
            break;

          case 'failed':
            if (event.type === 'RETRY') {
              return {
                state: 'authenticating',
                context: machine.context,
              };
            }
            break;

          case 'authenticated':
            if (event.type === 'LOGOUT') {
              return {
                state: 'idle',
                context: { ...machine.context, attempts: 0 },
              };
            }
            break;

          case 'locked':
            // No transitions from locked state
            break;
        }

        return machine; // No state change
      });

      let machine: AuthMachine = {
        state: 'idle',
        context: { attempts: 0, maxAttempts: 3 },
      };

      machine = await authStateMachine({ machine, event: { type: 'LOGIN' } });
      expect(machine.state).toBe('authenticating');

      // Fail twice
      machine = await authStateMachine({ machine, event: { type: 'FAILURE' } });
      expect(machine.state).toBe('failed');
      expect(machine.context.attempts).toBe(1);

      machine = await authStateMachine({ machine, event: { type: 'RETRY' } });
      machine = await authStateMachine({ machine, event: { type: 'FAILURE' } });
      expect(machine.context.attempts).toBe(2);

      // Third failure locks the account
      machine = await authStateMachine({ machine, event: { type: 'RETRY' } });
      machine = await authStateMachine({ machine, event: { type: 'FAILURE' } });
      expect(machine.state).toBe('locked');
      expect(machine.context.attempts).toBe(3);
    });
  });

  describe('Event Sourcing Pattern', () => {
    it('should maintain event log and rebuild state', async () => {
      interface Event {
        type: string;
        timestamp: number;
        payload: any;
      }

      interface AccountState {
        balance: number;
        transactions: number;
      }

      const eventStore: Event[] = [];

      const appendEvent = flow((event: Omit<Event, 'timestamp'>): Event => {
        const fullEvent = { ...event, timestamp: Date.now() };
        eventStore.push(fullEvent);
        return fullEvent;
      });

      const applyEvent = flow((input: { state: AccountState; event: Event }): AccountState => {
        const { state, event } = input;

        switch (event.type) {
          case 'DEPOSIT':
            return {
              balance: state.balance + event.payload.amount,
              transactions: state.transactions + 1,
            };
          case 'WITHDRAW':
            return {
              balance: state.balance - event.payload.amount,
              transactions: state.transactions + 1,
            };
          default:
            return state;
        }
      });

      const rebuildState = flow(async (events: Event[]): Promise<AccountState> => {
        const initialState: AccountState = { balance: 0, transactions: 0 };
        let state = initialState;

        for (const event of events) {
          state = await applyEvent({ state, event });
        }

        return state;
      });

      // Record events
      await appendEvent({ type: 'DEPOSIT', payload: { amount: 100 } });
      await appendEvent({ type: 'DEPOSIT', payload: { amount: 50 } });
      await appendEvent({ type: 'WITHDRAW', payload: { amount: 30 } });

      // Rebuild state from events
      const currentState = await rebuildState(eventStore);
      expect(currentState.balance).toBe(120);
      expect(currentState.transactions).toBe(3);

      // Can replay events to any point in time
      const stateAfterTwoEvents = await rebuildState(eventStore.slice(0, 2));
      expect(stateAfterTwoEvents.balance).toBe(150);
      expect(stateAfterTwoEvents.transactions).toBe(2);
    });

    it('should support event snapshots for performance', async () => {
      interface Event {
        id: number;
        type: string;
        data: any;
      }

      interface Snapshot {
        eventId: number;
        state: any;
        timestamp: number;
      }

      class EventSourcingSystem {
        private events: Event[] = [];
        private snapshots: Snapshot[] = [];
        private snapshotInterval = 10;

        appendEvent = flow((event: Omit<Event, 'id'>): Event => {
          const newEvent = { ...event, id: this.events.length };
          this.events.push(newEvent);

          // Create snapshot periodically
          if (newEvent.id > 0 && newEvent.id % this.snapshotInterval === 0) {
            this.createSnapshot(newEvent.id);
          }

          return newEvent;
        });

        private createSnapshot = async (eventId: number) => {
          const state = await this.getState(eventId);
          this.snapshots.push({
            eventId,
            state,
            timestamp: Date.now(),
          });
        };

        getState = flow(async (upToEventId?: number): Promise<any> => {
          const targetId = upToEventId ?? this.events.length - 1;

          // Find nearest snapshot
          const snapshot = this.snapshots
            .filter((s) => s.eventId <= targetId)
            .sort((a, b) => b.eventId - a.eventId)[0];

          let state = snapshot ? snapshot.state : { count: 0 };
          const startIndex = snapshot ? snapshot.eventId + 1 : 0;

          // Apply events from snapshot to target
          for (let i = startIndex; i <= targetId && i < this.events.length; i++) {
            const event = this.events[i]!;
            if (event.type === 'INCREMENT') {
              state = { count: state.count + event.data.amount };
            } else if (event.type === 'DECREMENT') {
              state = { count: state.count - event.data.amount };
            }
          }

          return state;
        });
      }

      const system = new EventSourcingSystem();

      // Add many events
      for (let i = 0; i < 25; i++) {
        await system.appendEvent({
          type: i % 2 === 0 ? 'INCREMENT' : 'DECREMENT',
          data: { amount: 1 },
        });
      }

      // State should be efficiently computed using snapshots
      const finalState = await system.getState();
      expect(finalState.count).toBe(1); // 13 increments - 12 decrements

      // Can get historical state
      const historicalState = await system.getState(10);
      expect(historicalState.count).toBe(1); // 6 increments - 5 decrements
    });
  });

  describe('Command Pattern', () => {
    it('should execute and undo commands', async () => {
      interface Command<T = any> {
        execute: Flow<T, T>;
        undo: Flow<T, T>;
        description: string;
      }

      class TextEditor {
        text = '';
        history: Array<{ command: Command<string>; previousState: string }> = [];
        historyIndex = -1;

        executeCommand = flow(async (command: Command<string>): Promise<void> => {
          // Remove any commands after current index (for redo)
          this.history = this.history.slice(0, this.historyIndex + 1);

          const previousState = this.text;
          this.text = await command.execute(this.text);

          this.history.push({ command, previousState });
          this.historyIndex++;
        });

        undo = flow(async (): Promise<boolean> => {
          if (this.historyIndex < 0) return false;

          const { previousState } = this.history[this.historyIndex]!;
          this.text = previousState;
          this.historyIndex--;

          return true;
        });

        redo = flow(async (): Promise<boolean> => {
          if (this.historyIndex >= this.history.length - 1) return false;

          this.historyIndex++;
          const { command } = this.history[this.historyIndex]!;
          this.text = await command.execute(this.text);

          return true;
        });
      }

      const createInsertCommand = (position: number, text: string): Command<string> => ({
        execute: flow((content: string) => {
          return content.slice(0, position) + text + content.slice(position);
        }),
        undo: flow((content: string) => {
          return content.slice(0, position) + content.slice(position + text.length);
        }),
        description: `Insert "${text}" at position ${position}`,
      });

      const createDeleteCommand = (start: number, end: number): Command<string> => {
        let deleted = '';
        return {
          execute: flow((content: string) => {
            deleted = content.slice(start, end);
            return content.slice(0, start) + content.slice(end);
          }),
          undo: flow((content: string) => {
            return content.slice(0, start) + deleted + content.slice(start);
          }),
          description: `Delete from ${start} to ${end}`,
        };
      };

      const editor = new TextEditor();

      // Execute commands
      await editor.executeCommand(createInsertCommand(0, 'Hello '));
      expect(editor.text).toBe('Hello ');

      await editor.executeCommand(createInsertCommand(6, 'World'));
      expect(editor.text).toBe('Hello World');

      await editor.executeCommand(createInsertCommand(5, ' Beautiful'));
      expect(editor.text).toBe('Hello Beautiful World');

      // Undo
      await editor.undo();
      expect(editor.text).toBe('Hello World');

      await editor.undo();
      expect(editor.text).toBe('Hello ');

      // Redo
      await editor.redo();
      expect(editor.text).toBe('Hello World');

      // New command after undo clears redo history
      await editor.executeCommand(createDeleteCommand(5, 11));
      expect(editor.text).toBe('Hello');

      // Can't redo after new command
      const canRedo = await editor.redo();
      expect(canRedo).toBe(false);
    });

    it('should support macro commands', async () => {
      interface Command {
        execute: Flow<any, any>;
        undo: Flow<any, any>;
      }

      class MacroCommand implements Command {
        private commands: Command[];

        constructor(commands: Command[]) {
          this.commands = commands;
        }

        execute = flow(async (state: any) => {
          let result = state;
          for (const command of this.commands) {
            result = await command.execute(result);
          }
          return result;
        });

        undo = flow(async (state: any) => {
          let result = state;
          // Undo in reverse order
          for (let i = this.commands.length - 1; i >= 0; i--) {
            result = await this.commands[i]!.undo(result);
          }
          return result;
        });
      }

      const incrementCommand: Command = {
        execute: flow((n: number) => n + 1),
        undo: flow((n: number) => n - 1),
      };

      const doubleCommand: Command = {
        execute: flow((n: number) => n * 2),
        undo: flow((n: number) => n / 2),
      };

      const macro = new MacroCommand([incrementCommand, doubleCommand, incrementCommand]);

      const result = await macro.execute(5);
      expect(result).toBe(13); // (5 + 1) * 2 + 1

      const undone = await macro.undo(13);
      expect(undone).toBe(5);
    });
  });

  describe('Reducer Pattern', () => {
    it('should manage state with reducer', async () => {
      type State = {
        count: number;
        history: number[];
      };

      type Action =
        | { type: 'INCREMENT'; payload?: number }
        | { type: 'DECREMENT'; payload?: number }
        | { type: 'RESET' }
        | { type: 'SET'; payload: number };

      const reducer = flow((input: { state: State; action: Action }): State => {
        const { state, action } = input;

        switch (action.type) {
          case 'INCREMENT':
            const inc = action.payload ?? 1;
            return {
              count: state.count + inc,
              history: [...state.history, state.count + inc],
            };

          case 'DECREMENT':
            const dec = action.payload ?? 1;
            return {
              count: state.count - dec,
              history: [...state.history, state.count - dec],
            };

          case 'RESET':
            return {
              count: 0,
              history: [...state.history, 0],
            };

          case 'SET':
            return {
              count: action.payload,
              history: [...state.history, action.payload],
            };

          default:
            return state;
        }
      });

      const initialState: State = { count: 0, history: [0] };

      let state = initialState;
      state = await reducer({ state, action: { type: 'INCREMENT' } });
      expect(state.count).toBe(1);

      state = await reducer({ state, action: { type: 'INCREMENT', payload: 5 } });
      expect(state.count).toBe(6);

      state = await reducer({ state, action: { type: 'DECREMENT', payload: 2 } });
      expect(state.count).toBe(4);

      state = await reducer({ state, action: { type: 'RESET' } });
      expect(state.count).toBe(0);
      expect(state.history).toEqual([0, 1, 6, 4, 0]);
    });
  });
});