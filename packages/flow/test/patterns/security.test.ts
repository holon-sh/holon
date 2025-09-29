import { describe, expect, it } from 'vitest';
import { flow, validate } from '../../src/flow.js';
import type { Flow } from '../../src/types.js';

describe('C.7 Security Patterns', () => {
  describe('Validation Pattern', () => {
    it('should validate input data', async () => {
      const emailValidator = validate(
        (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        'Invalid email format',
      );

      expect(await emailValidator('user@example.com')).toBe('user@example.com');
      await expect(async () => await emailValidator('invalid-email')).rejects.toThrow('Invalid email format');
    });

    it('should compose multiple validators', async () => {
      const minLength = (min: number) =>
        validate((s: string) => s.length >= min, `Must be at least ${min} characters`);

      const maxLength = (max: number) =>
        validate((s: string) => s.length <= max, `Must be at most ${max} characters`);

      const alphanumeric = validate(
        (s: string) => /^[a-zA-Z0-9]+$/.test(s),
        'Must contain only letters and numbers',
      );

      const usernameValidator = flow((username: string) =>
        minLength(3)
          .pipe(maxLength(20))
          .pipe(alphanumeric)(username),
      );

      expect(await usernameValidator('john123')).toBe('john123');
      await expect(async () => await usernameValidator('ab')).rejects.toThrow('Must be at least 3 characters');
      await expect(async () => await usernameValidator('a'.repeat(21))).rejects.toThrow('Must be at most 20 characters');
      await expect(async () => await usernameValidator('user@123')).rejects.toThrow('Must contain only letters and numbers');
    });

    it('should validate complex objects', async () => {
      interface UserRegistration {
        email: string;
        password: string;
        age: number;
        terms: boolean;
      }

      const validateRegistration = flow((data: UserRegistration) => {
        const errors: string[] = [];

        // Email validation
        if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
          errors.push('Invalid email');
        }

        // Password validation
        if (!data.password || data.password.length < 8) {
          errors.push('Password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(data.password)) {
          errors.push('Password must contain uppercase letter');
        }
        if (!/[0-9]/.test(data.password)) {
          errors.push('Password must contain number');
        }

        // Age validation
        if (data.age < 13 || data.age > 120) {
          errors.push('Age must be between 13 and 120');
        }

        // Terms validation
        if (!data.terms) {
          errors.push('Must accept terms and conditions');
        }

        if (errors.length > 0) {
          throw new Error(errors.join(', '));
        }

        return data;
      });

      const validData: UserRegistration = {
        email: 'user@example.com',
        password: 'SecurePass123',
        age: 25,
        terms: true,
      };

      expect(await validateRegistration(validData)).toEqual(validData);

      const invalidData: UserRegistration = {
        email: 'invalid',
        password: 'weak',
        age: 5,
        terms: false,
      };

      await expect(async () => await validateRegistration(invalidData)).rejects.toThrow();
    });
  });

  describe('Sanitization Pattern', () => {
    it('should sanitize HTML input', async () => {
      const sanitizeHtml = flow((input: string) => {
        return input
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;');
      });

      const input = '<script>alert("XSS")</script>';
      const sanitized = await sanitizeHtml(input);
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should sanitize SQL input', async () => {
      const sanitizeSql = flow((input: string) => {
        // Basic SQL injection prevention
        return input
          .replace(/'/g, "''") // Escape single quotes
          .replace(/;/g, '') // Remove semicolons
          .replace(/--/g, '') // Remove SQL comments
          .replace(/\/\*/g, '') // Remove block comments
          .replace(/\*\//g, '');
      });

      const maliciousInput = "'; DROP TABLE users; --";
      const sanitized = await sanitizeSql(maliciousInput);
      expect(sanitized).toBe("'' DROP TABLE users ");
    });

    it('should sanitize file paths', async () => {
      const sanitizePath = flow((path: string) => {
        // Prevent directory traversal
        return path
          .replace(/\.\./g, '') // Remove parent directory references
          .replace(/^\/+/, '') // Remove leading slashes
          .replace(/\/+/g, '/') // Normalize multiple slashes
          .replace(/[^\w\-\.\/]/g, '_'); // Replace special characters
      });

      const maliciousPath = '../../etc/passwd';
      const sanitized = await sanitizePath(maliciousPath);
      expect(sanitized).toBe('etc/passwd');

      const complexPath = '///path//to/../../../file.txt';
      const sanitized2 = await sanitizePath(complexPath);
      expect(sanitized2).toBe('path/to/file.txt');
    });

    it('should implement content security policy', async () => {
      interface Content {
        text: string;
        scripts?: string[];
        styles?: string[];
      }

      const applyCSP = flow((content: Content) => {
        const policy = {
          allowedDomains: ['example.com', 'cdn.example.com'],
          allowInlineScripts: false,
          allowInlineStyles: false,
        };

        const sanitized: Content = { text: content.text };

        // Filter scripts
        if (content.scripts) {
          sanitized.scripts = content.scripts.filter((src) => {
            const url = new URL(src, 'https://example.com');
            return policy.allowedDomains.includes(url.hostname);
          });
        }

        // Filter styles
        if (content.styles) {
          sanitized.styles = content.styles.filter((src) => {
            if (src.startsWith('data:') && !policy.allowInlineStyles) {
              return false;
            }
            if (src.startsWith('http')) {
              const url = new URL(src);
              return policy.allowedDomains.includes(url.hostname);
            }
            return false;
          });
        }

        return sanitized;
      });

      const content: Content = {
        text: 'Hello World',
        scripts: [
          'https://example.com/script.js',
          'https://evil.com/malicious.js',
          'https://cdn.example.com/lib.js',
        ],
        styles: [
          'https://example.com/style.css',
          'data:text/css,body{color:red}',
          'https://untrusted.com/style.css',
        ],
      };

      const secured = await applyCSP(content);
      expect(secured.scripts).toEqual([
        'https://example.com/script.js',
        'https://cdn.example.com/lib.js',
      ]);
      expect(secured.styles).toEqual(['https://example.com/style.css']);
    });
  });

  describe('Rate Limiting Pattern', () => {
    it('should limit request rate', async () => {
      class RateLimiter {
        private requests = new Map<string, number[]>();

        constructor(
          private maxRequests: number,
          private windowMs: number,
        ) {}

        check = flow(async (clientId: string): Promise<boolean> => {
          const now = Date.now();
          const clientRequests = this.requests.get(clientId) || [];

          // Remove old requests outside window
          const validRequests = clientRequests.filter((time) => now - time < this.windowMs);

          if (validRequests.length >= this.maxRequests) {
            return false; // Rate limit exceeded
          }

          validRequests.push(now);
          this.requests.set(clientId, validRequests);
          return true;
        });

        reset = flow(async (clientId: string) => {
          this.requests.delete(clientId);
        });
      }

      const limiter = new RateLimiter(3, 1000); // 3 requests per second

      // First 3 requests should pass
      expect(await limiter.check('client1')).toBe(true);
      expect(await limiter.check('client1')).toBe(true);
      expect(await limiter.check('client1')).toBe(true);

      // 4th request should be blocked
      expect(await limiter.check('client1')).toBe(false);

      // Different client should work
      expect(await limiter.check('client2')).toBe(true);

      // Wait for window to pass
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await limiter.check('client1')).toBe(true);
    });

    it('should implement token bucket algorithm', async () => {
      class TokenBucket {
        private tokens: number;
        private lastRefill: number;

        constructor(
          private capacity: number,
          private refillRate: number, // tokens per second
        ) {
          this.tokens = capacity;
          this.lastRefill = Date.now();
        }

        consume = flow(async (tokens: number): Promise<boolean> => {
          this.refill();

          if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
          }

          return false;
        });

        private refill() {
          const now = Date.now();
          const elapsed = (now - this.lastRefill) / 1000;
          const tokensToAdd = elapsed * this.refillRate;

          this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
          this.lastRefill = now;
        }

        getTokens(): number {
          this.refill();
          return Math.floor(this.tokens);
        }
      }

      const bucket = new TokenBucket(10, 2); // 10 capacity, 2 tokens/sec refill

      // Consume some tokens
      expect(await bucket.consume(5)).toBe(true);
      expect(bucket.getTokens()).toBe(5);

      // Try to consume more than available
      expect(await bucket.consume(6)).toBe(false);

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(bucket.getTokens()).toBeGreaterThanOrEqual(7); // 5 + ~2 from refill
    });

    it('should implement distributed rate limiting', async () => {
      interface RateLimitStore {
        increment(key: string, windowMs: number): Promise<number>;
        reset(key: string): Promise<void>;
      }

      class RedisLikeStore implements RateLimitStore {
        private data = new Map<string, { count: number; expires: number }>();

        async increment(key: string, windowMs: number): Promise<number> {
          const now = Date.now();
          const entry = this.data.get(key);

          if (entry && entry.expires > now) {
            entry.count++;
            return entry.count;
          } else {
            this.data.set(key, { count: 1, expires: now + windowMs });
            return 1;
          }
        }

        async reset(key: string): Promise<void> {
          this.data.delete(key);
        }
      }

      class DistributedRateLimiter {
        constructor(
          private store: RateLimitStore,
          private maxRequests: number,
          private windowMs: number,
        ) {}

        checkLimit = flow(async (clientId: string): Promise<{ allowed: boolean; remaining: number }> => {
          const count = await this.store.increment(clientId, this.windowMs);
          const allowed = count <= this.maxRequests;
          const remaining = Math.max(0, this.maxRequests - count);

          return { allowed, remaining };
        });
      }

      const store = new RedisLikeStore();
      const limiter = new DistributedRateLimiter(store, 5, 1000);

      // Test rate limiting
      const results: Array<{ allowed: boolean; remaining: number }> = [];
      for (let i = 0; i < 7; i++) {
        results.push(await limiter.checkLimit('user123'));
      }

      expect(results[0]!.allowed).toBe(true);
      expect(results[0]!.remaining).toBe(4);

      expect(results[4]!.allowed).toBe(true);
      expect(results[4]!.remaining).toBe(0);

      expect(results[5]!.allowed).toBe(false);
      expect(results[5]!.remaining).toBe(0);
    });
  });

  describe('Authentication/Authorization Pattern', () => {
    it('should implement role-based access control', async () => {
      type Role = 'admin' | 'user' | 'guest';
      type Permission = 'read' | 'write' | 'delete';

      const permissions: Record<Role, Permission[]> = {
        admin: ['read', 'write', 'delete'],
        user: ['read', 'write'],
        guest: ['read'],
      };

      interface User {
        id: string;
        role: Role;
      }

      const authorize = (requiredPermission: Permission) =>
        flow((user: User) => {
          const userPermissions = permissions[user.role];
          if (!userPermissions.includes(requiredPermission)) {
            throw new Error(`Unauthorized: missing ${requiredPermission} permission`);
          }
          return user;
        });

      const readData = flow(async (user: User) => {
        await authorize('read')(user);
        return 'Data read successfully';
      });

      const deleteData = flow(async (user: User) => {
        await authorize('delete')(user);
        return 'Data deleted successfully';
      });

      const adminUser: User = { id: '1', role: 'admin' };
      const normalUser: User = { id: '2', role: 'user' };
      const guestUser: User = { id: '3', role: 'guest' };

      await expect(readData(adminUser)).resolves.toBe('Data read successfully');
      await expect(deleteData(adminUser)).resolves.toBe('Data deleted successfully');

      await expect(readData(normalUser)).resolves.toBe('Data read successfully');
      await expect(deleteData(normalUser)).rejects.toThrow('Unauthorized');

      await expect(readData(guestUser)).resolves.toBe('Data read successfully');
      await expect(deleteData(guestUser)).rejects.toThrow('Unauthorized');
    });

    it('should implement JWT-like token validation', async () => {
      interface Token {
        payload: {
          userId: string;
          exp: number;
          iat: number;
          roles: string[];
        };
        signature: string;
      }

      const validateToken = flow((token: Token) => {
        // Check expiration
        if (Date.now() > token.payload.exp) {
          throw new Error('Token expired');
        }

        // Check issued at time (not in future)
        if (Date.now() < token.payload.iat) {
          throw new Error('Invalid token: issued in future');
        }

        // Verify signature (simplified)
        const expectedSignature = Buffer.from(JSON.stringify(token.payload)).toString('base64');
        if (token.signature !== expectedSignature) {
          throw new Error('Invalid signature');
        }

        return token.payload;
      });

      const validToken: Token = {
        payload: {
          userId: 'user123',
          exp: Date.now() + 3600000, // 1 hour from now
          iat: Date.now() - 60000, // 1 minute ago
          roles: ['user'],
        },
        signature: '',
      };
      validToken.signature = Buffer.from(JSON.stringify(validToken.payload)).toString('base64');

      const expiredToken: Token = {
        ...validToken,
        payload: { ...validToken.payload, exp: Date.now() - 1000 },
      };
      expiredToken.signature = Buffer.from(JSON.stringify(expiredToken.payload)).toString('base64');

      expect(await validateToken(validToken)).toEqual(validToken.payload);
      await expect(async () => await validateToken(expiredToken)).rejects.toThrow('Token expired');
    });
  });
});