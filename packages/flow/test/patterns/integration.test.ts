import { describe, expect, it } from 'vitest';
import { compose, flow } from '../../src/flow.js';
import type { Flow } from '../../src/types.js';

describe('C.4 Integration Patterns', () => {
  describe('Adapter Pattern', () => {
    it('should adapt incompatible interfaces', async () => {
      // Legacy API with different interface
      interface LegacyUser {
        firstName: string;
        lastName: string;
        emailAddress: string;
        phoneNumber: string;
      }

      // Modern API interface
      interface User {
        name: string;
        email: string;
        phone: string;
      }

      // Legacy service that returns old format
      const legacyService = flow(async (id: number): Promise<LegacyUser> => ({
        firstName: 'John',
        lastName: 'Doe',
        emailAddress: `user${id}@example.com`,
        phoneNumber: '555-0123',
      }));

      // Adapter to convert legacy to modern format
      const legacyAdapter = flow((legacy: LegacyUser): User => ({
        name: `${legacy.firstName} ${legacy.lastName}`,
        email: legacy.emailAddress,
        phone: legacy.phoneNumber,
      }));

      // Modern service that expects new format
      const modernService = flow((user: User) => ({
        ...user,
        id: Math.random(),
        createdAt: new Date(),
      }));

      // Compose with adapter
      const adaptedFlow = compose(legacyService, legacyAdapter, modernService);

      const result = await adaptedFlow(42);
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('user42@example.com');
      expect(result.phone).toBe('555-0123');
    });

    it('should adapt different data formats', async () => {
      // XML-like structure
      interface XmlData {
        root: {
          item: Array<{
            attributes: { id: string };
            children: { name: string; value: string };
          }>;
        };
      }

      // JSON structure
      interface JsonData {
        items: Array<{
          id: string;
          name: string;
          value: string;
        }>;
      }

      const xmlToJsonAdapter = flow((xml: XmlData): JsonData => ({
        items: xml.root.item.map((item) => ({
          id: item.attributes.id,
          name: item.children.name,
          value: item.children.value,
        })),
      }));

      const xmlData: XmlData = {
        root: {
          item: [
            {
              attributes: { id: '1' },
              children: { name: 'Item One', value: '100' },
            },
            {
              attributes: { id: '2' },
              children: { name: 'Item Two', value: '200' },
            },
          ],
        },
      };

      const jsonData = await xmlToJsonAdapter(xmlData);
      expect(jsonData.items).toHaveLength(2);
      expect(jsonData.items[0]).toEqual({
        id: '1',
        name: 'Item One',
        value: '100',
      });
    });

    it('should create bidirectional adapters', async () => {
      interface DatabaseRecord {
        id: number;
        created_at: string;
        updated_at: string;
        user_name: string;
        is_active: boolean;
      }

      interface DomainModel {
        id: number;
        createdAt: Date;
        updatedAt: Date;
        userName: string;
        isActive: boolean;
      }

      const dbToDomainAdapter = flow((record: DatabaseRecord): DomainModel => ({
        id: record.id,
        createdAt: new Date(record.created_at),
        updatedAt: new Date(record.updated_at),
        userName: record.user_name,
        isActive: record.is_active,
      }));

      const domainToDbAdapter = flow((model: DomainModel): DatabaseRecord => ({
        id: model.id,
        created_at: model.createdAt.toISOString(),
        updated_at: model.updatedAt.toISOString(),
        user_name: model.userName,
        is_active: model.isActive,
      }));

      const dbRecord: DatabaseRecord = {
        id: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        user_name: 'john_doe',
        is_active: true,
      };

      const domainModel = await dbToDomainAdapter(dbRecord);
      expect(domainModel.userName).toBe('john_doe');
      expect(domainModel.createdAt).toBeInstanceOf(Date);

      const backToDb = await domainToDbAdapter(domainModel);
      expect(backToDb).toEqual(dbRecord);
    });
  });

  describe('Gateway Pattern', () => {
    it('should provide unified interface to multiple services', async () => {
      // Different payment providers
      const stripeGateway = flow(async (amount: number) => ({
        provider: 'stripe',
        transactionId: `stripe_${Date.now()}`,
        amount,
        fee: amount * 0.029 + 0.3,
      }));

      const paypalGateway = flow(async (amount: number) => ({
        provider: 'paypal',
        transactionId: `paypal_${Date.now()}`,
        amount,
        fee: amount * 0.034 + 0.3,
      }));

      const squareGateway = flow(async (amount: number) => ({
        provider: 'square',
        transactionId: `square_${Date.now()}`,
        amount,
        fee: amount * 0.026 + 0.1,
      }));

      // Unified payment gateway
      const paymentGateway = flow(
        async (input: { amount: number; provider?: string }) => {
          const { amount, provider = 'stripe' } = input;

          switch (provider) {
            case 'paypal':
              return await paypalGateway(amount);
            case 'square':
              return await squareGateway(amount);
            case 'stripe':
            default:
              return await stripeGateway(amount);
          }
        },
      );

      const stripeResult = await paymentGateway({ amount: 100 });
      expect(stripeResult.provider).toBe('stripe');
      expect(stripeResult.fee).toBeCloseTo(3.2, 1);

      const paypalResult = await paymentGateway({ amount: 100, provider: 'paypal' });
      expect(paypalResult.provider).toBe('paypal');
      expect(paypalResult.fee).toBeCloseTo(3.7, 1);
    });

    it('should handle service discovery and routing', async () => {
      interface ServiceRegistry {
        [key: string]: Flow<any, any>;
      }

      class ApiGateway {
        private services: ServiceRegistry = {};

        registerService = flow((input: { name: string; service: Flow<any, any> }) => {
          this.services[input.name] = input.service;
          return { registered: true, name: input.name };
        });

        route = flow(async (input: { service: string; data: any }) => {
          const service = this.services[input.service];
          if (!service) {
            throw new Error(`Service ${input.service} not found`);
          }
          return await service(input.data);
        });

        // Health check all services
        healthCheck = flow(async () => {
          const results: Record<string, boolean> = {};

          for (const [name, service] of Object.entries(this.services)) {
            try {
              // Assume services respond to health check
              await service({ healthCheck: true });
              results[name] = true;
            } catch {
              results[name] = false;
            }
          }

          return results;
        });
      }

      const gateway = new ApiGateway();

      // Register services
      await gateway.registerService({
        name: 'users',
        service: flow((data: any) => {
          if (data.healthCheck) return { status: 'healthy' };
          return { user: `User for ${data.id}` };
        }),
      });

      await gateway.registerService({
        name: 'orders',
        service: flow((data: any) => {
          if (data.healthCheck) return { status: 'healthy' };
          return { order: `Order for ${data.userId}` };
        }),
      });

      // Route to services
      const userResult = await gateway.route({
        service: 'users',
        data: { id: 123 },
      });
      expect(userResult.user).toBe('User for 123');

      const orderResult = await gateway.route({
        service: 'orders',
        data: { userId: 123 },
      });
      expect(orderResult.order).toBe('Order for 123');

      // Health check
      const health = await gateway.healthCheck();
      expect(health).toEqual({
        users: true,
        orders: true,
      });
    });
  });

  describe('Facade Pattern', () => {
    it('should simplify complex subsystem interactions', async () => {
      // Complex subsystems
      const inventorySystem = flow(async (productId: string) => ({
        productId,
        available: Math.floor(Math.random() * 100),
        warehouse: 'A',
      }));

      const pricingSystem = flow(async (productId: string) => ({
        productId,
        price: Math.random() * 100,
        currency: 'USD',
        tax: 0.08,
      }));

      const shippingSystem = flow(
        async (input: { productId: string; quantity: number }) => ({
          productId: input.productId,
          shippingCost: input.quantity * 5,
          estimatedDays: 3,
        }),
      );

      const promotionSystem = flow(async (productId: string) => ({
        productId,
        discount: Math.random() > 0.5 ? 0.1 : 0,
        promoCode: Math.random() > 0.5 ? 'SAVE10' : null,
      }));

      // Facade that simplifies interaction
      const productFacade = flow(
        async (input: { productId: string; quantity: number }) => {
          const { productId, quantity } = input;

          // Parallel calls to subsystems
          const [inventory, pricing, shipping, promotion] = await Promise.all([
            inventorySystem(productId),
            pricingSystem(productId),
            shippingSystem({ productId, quantity }),
            promotionSystem(productId),
          ]);

          // Combine results in simple interface
          const subtotal = pricing.price * quantity;
          const discount = promotion.discount * subtotal;
          const total = subtotal - discount + shipping.shippingCost;

          return {
            available: inventory.available >= quantity,
            price: pricing.price,
            quantity,
            subtotal,
            discount,
            shipping: shipping.shippingCost,
            total,
            estimatedDelivery: shipping.estimatedDays,
            promoCode: promotion.promoCode,
          };
        },
      );

      const result = await productFacade({
        productId: 'PROD123',
        quantity: 2,
      });

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('total');
      expect(result.shipping).toBe(10); // 2 * 5
      expect(result.subtotal).toBe(result.price * result.quantity);
    });

    it('should provide multiple facade levels', async () => {
      // Low-level database operations
      const dbConnection = {
        query: flow(async (sql: string) => ({ rows: [], sql })),
        beginTransaction: flow(async () => ({ id: 'tx123' })),
        commit: flow(async (txId: string) => ({ committed: true, txId })),
        rollback: flow(async (txId: string) => ({ rolledBack: true, txId })),
      };

      // Mid-level repository facade
      const userRepository = {
        findById: flow(async (id: number) => {
          await dbConnection.query(`SELECT * FROM users WHERE id = ${id}`);
          return { id, name: `User${id}` };
        }),

        save: flow(async (user: { id: number; name: string }) => {
          const tx = await dbConnection.beginTransaction();
          try {
            await dbConnection.query(`UPDATE users SET name = '${user.name}' WHERE id = ${user.id}`);
            await dbConnection.commit(tx.id);
            return user;
          } catch (error) {
            await dbConnection.rollback(tx.id);
            throw error;
          }
        }),
      };

      // High-level service facade
      const userService = flow(
        async (input: { action: 'get' | 'update'; id: number; name?: string }) => {
          switch (input.action) {
            case 'get':
              return await userRepository.findById(input.id);
            case 'update':
              const user = await userRepository.findById(input.id);
              return await userRepository.save({ ...user, name: input.name! });
            default:
              throw new Error('Unknown action');
          }
        },
      );

      // Client uses simple facade
      const getResult = await userService({ action: 'get', id: 1 });
      expect(getResult.name).toBe('User1');

      const updateResult = await userService({
        action: 'update',
        id: 1,
        name: 'Updated User',
      });
      expect(updateResult.name).toBe('Updated User');
    });
  });

  describe('Anti-Corruption Layer Pattern', () => {
    it('should isolate domain from external systems', async () => {
      // External system with its own domain language
      interface ExternalOrder {
        ORDER_ID: string;
        CUST_NO: string;
        ORD_DATE: string;
        ORD_STATUS: 'P' | 'S' | 'C' | 'X';
        ITEMS: Array<{
          PROD_CODE: string;
          QTY: number;
          PRICE: number;
        }>;
      }

      // Our domain model
      interface Order {
        id: string;
        customerId: string;
        orderDate: Date;
        status: 'pending' | 'shipped' | 'completed' | 'cancelled';
        items: Array<{
          productId: string;
          quantity: number;
          price: number;
        }>;
      }

      // Anti-corruption layer
      const orderAntiCorruptionLayer = {
        fromExternal: flow((external: ExternalOrder): Order => {
          const statusMap: Record<ExternalOrder['ORD_STATUS'], Order['status']> = {
            P: 'pending',
            S: 'shipped',
            C: 'completed',
            X: 'cancelled',
          };

          return {
            id: external.ORDER_ID,
            customerId: external.CUST_NO,
            orderDate: new Date(external.ORD_DATE),
            status: statusMap[external.ORD_STATUS],
            items: external.ITEMS.map((item) => ({
              productId: item.PROD_CODE,
              quantity: item.QTY,
              price: item.PRICE,
            })),
          };
        }),

        toExternal: flow((order: Order): ExternalOrder => {
          const statusMap: Record<Order['status'], ExternalOrder['ORD_STATUS']> = {
            pending: 'P',
            shipped: 'S',
            completed: 'C',
            cancelled: 'X',
          };

          return {
            ORDER_ID: order.id,
            CUST_NO: order.customerId,
            ORD_DATE: order.orderDate.toISOString(),
            ORD_STATUS: statusMap[order.status],
            ITEMS: order.items.map((item) => ({
              PROD_CODE: item.productId,
              QTY: item.quantity,
              PRICE: item.price,
            })),
          };
        }),
      };

      const externalOrder: ExternalOrder = {
        ORDER_ID: 'ORD123',
        CUST_NO: 'CUST456',
        ORD_DATE: '2024-01-01T00:00:00.000Z',
        ORD_STATUS: 'P',
        ITEMS: [
          { PROD_CODE: 'PROD1', QTY: 2, PRICE: 50 },
          { PROD_CODE: 'PROD2', QTY: 1, PRICE: 100 },
        ],
      };

      const domainOrder = await orderAntiCorruptionLayer.fromExternal(externalOrder);
      expect(domainOrder.status).toBe('pending');
      expect(domainOrder.customerId).toBe('CUST456');
      expect(domainOrder.items[0]!.productId).toBe('PROD1');

      const backToExternal = await orderAntiCorruptionLayer.toExternal(domainOrder);
      expect(backToExternal).toEqual(externalOrder);
    });
  });
});